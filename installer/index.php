<?php
declare(strict_types=1);
$root = dirname(__DIR__);
$configuredLock = $root . '/.configured';
$installedLock = __DIR__ . '/.installed';
$envPath = $root . '/.env';
$bootstrapPath = $root . '/.installer-bootstrap.json';

function installerRequestIsHttps(): bool {
    $httpsFlag = strtolower((string)($_SERVER['HTTPS'] ?? ''));
    if ($httpsFlag !== '' && $httpsFlag !== 'off' && $httpsFlag !== '0') return true;
    if (strtolower((string)($_SERVER['REQUEST_SCHEME'] ?? '')) === 'https') return true;

    // Only honor a forwarded scheme when the immediate peer is explicitly
    // allowlisted by the hosting operator. Never trust X-Forwarded-Proto alone.
    $remoteAddress = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
    $trustedProxies = array_filter(array_map('trim', explode(',', (string)getenv('INSTALLER_TRUSTED_PROXY_IPS'))));
    if ($remoteAddress === '' || !in_array($remoteAddress, $trustedProxies, true)) return false;
    $forwardedProto = strtolower(trim(explode(',', (string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))[0] ?? ''));
    return $forwardedProto === 'https';
}

/**
 * Run a fixed version command without a shell. Hosting operators can set
 * ARBITRADE_NODE_BINARY / ARBITRADE_PNPM_BINARY when cPanel keeps binaries
 * outside PHP's PATH. An unavailable process API is a blocking preflight.
 */
function installerCommandOutput(string $binary, array $arguments): ?string {
    if (!function_exists('proc_open') || $binary === '' || str_contains($binary, "\0")) return null;
    $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $process = @proc_open(array_merge([$binary], $arguments), $descriptors, $pipes, dirname(__DIR__), null, ['bypass_shell' => true]);
    if (!is_resource($process)) return null;
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $status = proc_close($process);
    if ($status !== 0) return null;
    $output = trim((string)$stdout);
    return $output !== '' ? $output : null;
}

/** Treat dangling symlinks as existing protected state; file_exists() alone misses them. */
function installerPathExists(string $path): bool {
    return file_exists($path) || is_link($path);
}

if (installerPathExists($configuredLock) || installerPathExists($installedLock) || installerPathExists($envPath) || installerPathExists($bootstrapPath)) {
    http_response_code(403);
    exit('The installer is locked because configuration already exists. Do not delete lock files to reinstall over an existing site.');
}
$isHttps = installerRequestIsHttps();
session_set_cookie_params(['httponly' => true, 'secure' => $isHttps, 'samesite' => 'Strict']);
session_start();
if (empty($_SESSION['installer_csrf'])) $_SESSION['installer_csrf'] = bin2hex(random_bytes(32));
$csrf = $_SESSION['installer_csrf'];
$message = '';
$error = '';

function postval(string $key): string { return trim((string)($_POST[$key] ?? '')); }
function envline(string $key, string $value): string {
    $value = str_replace(["\\", "\"", "\r", "\n"], ["\\\\", "\\\"", '', ''], $value);
    return $key . '="' . $value . '"';
}
function h(?string $value): string { return htmlspecialchars($value ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function validPort(string $value, int $default): int {
    if ($value === '') return $default;
    if (!ctype_digit($value) || (int)$value < 1 || (int)$value > 65535) throw new RuntimeException('Port numbers must be between 1 and 65535.');
    return (int)$value;
}

/**
 * Detect a usable URL from the current request when the web server exposes a
 * trustworthy scheme and a syntactically valid host. Do not trust
 * X-Forwarded-Host / X-Forwarded-Proto: proxy topology is host-specific.
 * If detection is not reliable, leave the field empty so the operator must
 * enter the public URL explicitly.
 */
function detectPublicAppUrl(): string {
    $httpsFlag = strtolower((string)($_SERVER['HTTPS'] ?? ''));
    $scheme = installerRequestIsHttps() ? 'https' : '';
    if ($scheme === '') {
        $requestScheme = strtolower((string)($_SERVER['REQUEST_SCHEME'] ?? ''));
        if (in_array($requestScheme, ['http', 'https'], true)) $scheme = $requestScheme;
    }

    $rawHost = trim((string)($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? ''));
    if ($scheme === '' || $rawHost === '' || preg_match('/[\x00-\x20\\\\\/\\?#@]/', $rawHost)) return '';

    $candidate = $scheme . '://' . $rawHost;
    $parts = parse_url($candidate);
    if (!is_array($parts) || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['path']) || isset($parts['query']) || isset($parts['fragment'])) return '';

    $host = strtolower(trim((string)$parts['host'], '[]'));
    if ($host === '' || $host === 'localhost' || str_ends_with($host, '.localhost') || str_ends_with($host, '.local')) return '';

    if (filter_var($host, FILTER_VALIDATE_IP)) {
        // Do not silently use loopback, private, or reserved IPs as a
        // production-facing URL. Operators can still enter an explicit URL
        // and opt into HTTP for local testing when appropriate.
        if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) return '';
    } elseif (filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) === false) {
        return '';
    }

    if (isset($parts['port']) && ((int)$parts['port'] < 1 || (int)$parts['port'] > 65535)) return '';
    return $candidate;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        if (!hash_equals($csrf, postval('csrf'))) throw new RuntimeException('Your installer session expired. Refresh and try again.');
        if (PHP_VERSION_ID < 80200) throw new RuntimeException('PHP 8.2 or newer is required for the installer. Select a supported PHP version in cPanel and reload this page.');
        $missingExtensions = array_values(array_filter(['pdo_mysql', 'openssl', 'json', 'mbstring'], static fn(string $extension): bool => !extension_loaded($extension)));
        if ($missingExtensions !== []) throw new RuntimeException('Enable these required PHP extensions in cPanel before continuing: ' . implode(', ', $missingExtensions) . '.');
        if (!is_file($root . '/package.json') || !is_file($root . '/pnpm-lock.yaml')) throw new RuntimeException('The application package is incomplete. Upload the complete Arbitrade ZIP, including package.json and pnpm-lock.yaml.');
        $nodeBinary = trim((string)(getenv('ARBITRADE_NODE_BINARY') ?: 'node'));
        $pnpmBinary = trim((string)(getenv('ARBITRADE_PNPM_BINARY') ?: 'pnpm'));
        $nodeVersionOutput = installerCommandOutput($nodeBinary, ['--version']);
        $pnpmVersionOutput = installerCommandOutput($pnpmBinary, ['--version']);
        $nodeVersionValid = $nodeVersionOutput !== null && preg_match('/^v?(\\d+)\\./', $nodeVersionOutput, $nodeVersionMatch) === 1 && (int)$nodeVersionMatch[1] >= 20;
        $pnpmVersionValid = $pnpmVersionOutput !== null && preg_match('/^10\\.18\\./', $pnpmVersionOutput) === 1;
        if (!$nodeVersionValid) throw new RuntimeException('Node.js 20+ could not be verified by PHP. Make the runtime available in the PHP environment or set ARBITRADE_NODE_BINARY to the exact executable path.');
        if (!$pnpmVersionValid) throw new RuntimeException('pnpm 10.18.x could not be verified by PHP. Make pnpm available in the PHP environment or set ARBITRADE_PNPM_BINARY to the exact executable path.');
        if (!is_file($root . '/node_modules/.modules.yaml')) throw new RuntimeException('Dependencies are not installed. Run pnpm install --frozen-lockfile from the private application root, then reload the installer.');
        if (!is_writable($root)) throw new RuntimeException('The application root is not writable by PHP. Adjust deployment permissions, save configuration, then remove write access after installation.');
        $mode = postval('install_mode');
        if (!in_array($mode, ['fresh', 'existing'], true)) throw new RuntimeException('Choose a fresh installation or an existing-database deployment.');
        $submittedAppUrl = postval('app_url');
        $appUrl = rtrim($submittedAppUrl !== '' ? $submittedAppUrl : detectPublicAppUrl(), '/');
        if ($appUrl === '') throw new RuntimeException('The public URL could not be detected safely. Enter your public application URL (for example, https://your-domain.com) and try again.');
        if (!filter_var($appUrl, FILTER_VALIDATE_URL) || !in_array(strtolower((string)parse_url($appUrl, PHP_URL_SCHEME)), ['https', 'http'], true)) throw new RuntimeException('Enter a valid application URL.');
        $parsedAppUrl = parse_url($appUrl);
        if (is_array($parsedAppUrl) && (isset($parsedAppUrl['user']) || isset($parsedAppUrl['pass']))) throw new RuntimeException('The application URL must not contain a username or password. Enter the public URL only.');
        if (!str_starts_with(strtolower($appUrl), 'https://') && postval('allow_http') !== '1') throw new RuntimeException('Use HTTPS for production, or explicitly enable HTTP for local testing only.');

        $dbHost = postval('db_host') ?: '127.0.0.1';
        if (preg_match('/[\r\n;]/', $dbHost)) throw new RuntimeException('Database host contains invalid characters.');
        $dbPort = validPort(postval('db_port'), 3306);
        $dbName = postval('db_name');
        $dbUser = postval('db_user');
        $dbPass = (string)($_POST['db_pass'] ?? '');
        if ($dbName === '' || !preg_match('/^[A-Za-z0-9_]+$/', $dbName)) throw new RuntimeException('Database name may contain only letters, numbers, and underscores.');
        if ($dbUser === '') throw new RuntimeException('Database username is required.');

        if (postval('create_db') === '1') {
            $server = new PDO('mysql:host=' . $dbHost . ';port=' . $dbPort . ';charset=utf8mb4', $dbUser, $dbPass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 8]);
            $server->exec('CREATE DATABASE IF NOT EXISTS ' . $dbName . ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        }
        $pdo = new PDO('mysql:host=' . $dbHost . ';port=' . $dbPort . ';dbname=' . $dbName . ';charset=utf8mb4', $dbUser, $dbPass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 8]);
        $tableRows = $pdo->query('SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name')->fetchAll(PDO::FETCH_COLUMN);
        $tableNames = array_values(array_map('strval', $tableRows));
        $tableCount = count($tableNames);
        if ($mode === 'fresh' && $tableCount !== 0) throw new RuntimeException("Fresh installation requires an empty database; this database contains {$tableCount} tables. No data was changed.");
        $backupConfirmed = isset($_POST['backup_confirmed']) && $_POST['backup_confirmed'] === '1';
        if ($mode === 'existing') {
            if ($tableCount === 0) throw new RuntimeException('Existing-database mode requires a restored/imported database first. The selected database is empty.');
            if (!$backupConfirmed) throw new RuntimeException('Before continuing with an existing database, confirm that a current, restorable backup exists and that the intended backup has been imported into this target database.');
            $usersTable = in_array('users', $tableNames, true);
            if (!$usersTable) throw new RuntimeException('The selected database does not contain the expected users table. Verify that the correct Arbitrade backup was imported.');
        }

        $adminEmail = strtolower(postval('admin_email'));
        $adminPassword = (string)($_POST['admin_password'] ?? '');
        $customerEmail = strtolower(postval('customer_email'));
        $customerPassword = (string)($_POST['customer_password'] ?? '');
        if ($mode === 'fresh') {
            if (!filter_var($adminEmail, FILTER_VALIDATE_EMAIL) || strlen($adminEmail) > 320) throw new RuntimeException('Enter a valid administrator email of at most 320 characters for a fresh installation.');
            if (strlen($adminPassword) < 12 || strlen($adminPassword) > 200) throw new RuntimeException('Administrator password must be between 12 and 200 characters.');
            if (!filter_var($customerEmail, FILTER_VALIDATE_EMAIL) || strlen($customerEmail) > 320) throw new RuntimeException('Enter a valid customer email of at most 320 characters for a fresh installation.');
            if (strlen($customerPassword) < 12 || strlen($customerPassword) > 200) throw new RuntimeException('Customer password must be between 12 and 200 characters.');
            if ($adminEmail === $customerEmail) throw new RuntimeException('Administrator and customer accounts must use different email addresses.');
            if ($adminPassword === $customerPassword) throw new RuntimeException('Administrator and customer passwords must be different.');
        } else {
            $adminEmail = '';
            $adminPassword = '';
            $customerEmail = '';
            $customerPassword = '';
        }
        $appPort = validPort(postval('port'), 3000);
        $databaseUrl = 'mysql://' . rawurlencode($dbUser) . ':' . rawurlencode($dbPass) . '@' . (str_contains($dbHost, ':') && !str_starts_with($dbHost, '[') ? '[' . $dbHost . ']' : $dbHost) . ':' . $dbPort . '/' . $dbName;

        $lines = [
            'NODE_ENV="production"', 'PORT="' . $appPort . '"',
            // The installer cannot securely infer the hosting proxy topology.
            // Default to direct-client mode; only set a positive hop count after
            // verifying the actual trusted reverse-proxy chain.
            'TRUST_PROXY_HOPS="0"',
            envline('PUBLIC_APP_URL', $appUrl), envline('DATABASE_URL', $databaseUrl),
            envline('SESSION_SECRET', bin2hex(random_bytes(32))), envline('PASSWORD_PEPPER', bin2hex(random_bytes(32))),
            // Mail transport is configured only after the administrator signs in.
            envline('ADMIN_EMAIL', $adminEmail),
        ];
        // A fresh database can safely receive a new authenticator key. For an
        // existing database, preserve its original key from the previous private
        // environment; silently replacing it could make enrolled 2FA secrets unreadable.
        if ($mode === 'fresh') {
            $lines[] = envline('TOTP_ENCRYPTION_KEY', bin2hex(random_bytes(32)));
        }
        $bootstrap = json_encode([
            'mode' => $mode,
            'adminEmail' => $adminEmail,
            'adminPassword' => $adminPassword,
            'customerEmail' => $customerEmail,
            'customerPassword' => $customerPassword,
            'databaseTableCount' => $tableCount,
            'databaseTableNames' => $tableNames,
            'backupConfirmed' => $mode === 'existing' && $backupConfirmed,
            'databaseCheckedAt' => gmdate('c'),
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        $envTmp = $root . '/.env.installing.' . bin2hex(random_bytes(6));
        $bootstrapTmp = $root . '/.installer-bootstrap.tmp.' . bin2hex(random_bytes(6));
        if (file_put_contents($envTmp, implode("\n", $lines) . "\n", LOCK_EX) === false) throw new RuntimeException('Could not write environment configuration. Check application-directory permissions.');
        chmod($envTmp, 0600);
        if (file_put_contents($bootstrapTmp, $bootstrap, LOCK_EX) === false) { @unlink($envTmp); throw new RuntimeException('Could not write the one-time initial-account bootstrap.'); }
        chmod($bootstrapTmp, 0600);
        if (installerPathExists($envPath) || installerPathExists($bootstrapPath) || installerPathExists($configuredLock) || installerPathExists($installedLock)) {
            @unlink($envTmp); @unlink($bootstrapTmp);
            throw new RuntimeException('Configuration appeared while this wizard was running. Refresh and contact your administrator before retrying.');
        }
        if (!rename($envTmp, $envPath)) {
            @unlink($envTmp); @unlink($bootstrapTmp);
            throw new RuntimeException('Could not save environment configuration. Check filesystem permissions.');
        }
        if (!rename($bootstrapTmp, $bootstrapPath)) {
            @unlink($envPath); @unlink($bootstrapTmp);
            throw new RuntimeException('Could not save the one-time bootstrap file. No configuration was retained.');
        }
        if (file_put_contents($configuredLock, gmdate('c') . "\n", LOCK_EX) === false) {
            @unlink($bootstrapPath); @unlink($envPath);
            throw new RuntimeException('Could not write the installer lock. Configuration files were removed; check filesystem permissions.');
        }
        chmod($configuredLock, 0600);
        session_regenerate_id(true);
        $message = 'Database connection verified; ' . $tableCount . ' table(s) detected and the table inventory saved for a second safety check. No schema migrations have run yet. Continue from the private cPanel terminal using the command shown below.';
    } catch (Throwable $e) {
        $error = $e instanceof PDOException
            ? 'Database connection failed. Verify the database host, name, username, password, and privileges. Configuration was not saved.'
            : $e->getMessage();
    }
}
$diskFree = @disk_free_space($root);
$httpsDetected = installerRequestIsHttps();
$detectedAppUrl = detectPublicAppUrl();
$requiredExtensions = ['pdo_mysql', 'openssl', 'json', 'mbstring'];
$extensionChecks = [];
foreach ($requiredExtensions as $extension) $extensionChecks[$extension] = extension_loaded($extension);
$nodeBinary = trim((string)(getenv('ARBITRADE_NODE_BINARY') ?: 'node'));
$pnpmBinary = trim((string)(getenv('ARBITRADE_PNPM_BINARY') ?: 'pnpm'));
$nodeVersionOutput = installerCommandOutput($nodeBinary, ['--version']);
$pnpmVersionOutput = installerCommandOutput($pnpmBinary, ['--version']);
$nodeVersionValid = $nodeVersionOutput !== null && preg_match('/^v?(\\d+)\\./', $nodeVersionOutput, $nodeVersionMatch) === 1 && (int)$nodeVersionMatch[1] >= 20;
$pnpmVersionValid = $pnpmVersionOutput !== null && preg_match('/^10\\.18\\./', $pnpmVersionOutput) === 1;
$nodeModulesReady = is_file($root . '/node_modules/.modules.yaml');
$buildReady = is_file($root . '/dist/index.js');
$packageReady = is_file($root . '/package.json') && is_file($root . '/pnpm-lock.yaml');
$installerLocked = installerPathExists($configuredLock) || installerPathExists($installedLock) || installerPathExists($envPath) || installerPathExists($bootstrapPath);
$rootWritable = is_writable($root);
$diskFreeLabel = $diskFree === false ? 'Unavailable on this host' : (string)round($diskFree / 1024 / 1024) . ' MB free';
$preflightBlocked = PHP_VERSION_ID < 80200 || in_array(false, $extensionChecks, true) || !$rootWritable || !$packageReady || !$nodeVersionValid || !$pnpmVersionValid || !$nodeModulesReady || $installerLocked;
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Arbitrade installation wizard</title>
<style>
:root{color-scheme:dark;--bg:#060916;--cyan:#55f3e2;--blue:#6da7ff;--violet:#bd86ff;--pink:#ff7ad9;--text:#f0f5ff;--muted:#a5b4d3;--good:#62f0bb}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 8% 0%,#1d2450 0,transparent 35%),radial-gradient(ellipse at 100% 18%,#123c52 0,transparent 32%),var(--bg);color:var(--text);font:15px/1.6 Inter,ui-sans-serif,system-ui,sans-serif;overflow-x:hidden}body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.17;background-image:linear-gradient(#7a9acb16 1px,transparent 1px),linear-gradient(90deg,#7a9acb16 1px,transparent 1px);background-size:36px 36px;mask-image:linear-gradient(to bottom,#000,transparent 85%)}
.wrap{position:relative;max-width:1240px;margin:0 auto;padding:clamp(14px,3vw,36px)}.card{position:relative;overflow:hidden;background:linear-gradient(145deg,#111a31f5,#0b1122f7);border:1px solid #35466d;border-radius:28px;padding:clamp(18px,3.4vw,42px);box-shadow:0 28px 100px #0008,inset 0 1px #ffffff12}.card:before{content:"";position:absolute;top:0;left:8%;right:8%;height:2px;background:linear-gradient(90deg,transparent,var(--cyan),var(--violet),transparent);filter:drop-shadow(0 0 8px #55f3e2aa)}
.brand-row{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.brand{display:flex;align-items:center;gap:12px;font-size:clamp(18px,2.3vw,25px);font-weight:900;letter-spacing:.12em}.brand-mark{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;color:#07111d;background:linear-gradient(135deg,var(--cyan),var(--blue));box-shadow:0 0 28px #55f3e244;font-size:21px}.brand span:last-child{color:var(--cyan)}.status-pill{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border:1px solid #3d5c73;border-radius:999px;background:#101f35;color:#b9f9f0;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.status-pill:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--good);box-shadow:0 0 12px var(--good);animation:pulse 1.8s infinite}
.kicker{color:var(--cyan);font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;margin:25px 0 8px}h1{margin:0 0 10px;font-size:clamp(28px,4vw,46px);line-height:1.08;letter-spacing:-.035em}h1 .gradient{background:linear-gradient(90deg,#fff,var(--cyan),#bca2ff);-webkit-background-clip:text;background-clip:text;color:transparent}h2{font-size:clamp(18px,2.3vw,23px);letter-spacing:-.02em;margin:0 0 18px;padding:0;border:0}h2:before{content:"";display:inline-block;width:5px;height:21px;margin-right:11px;vertical-align:-4px;border-radius:4px;background:linear-gradient(var(--cyan),var(--violet));box-shadow:0 0 15px #55f3e244}.sub,.intro{color:var(--muted);line-height:1.8;max-width:850px}.intro{margin:0 0 24px}
.preflight-shell{margin:24px 0;padding:clamp(14px,2.4vw,24px);border:1px solid #314467;border-radius:22px;background:linear-gradient(135deg,#101a30e8,#0a1424e8);box-shadow:inset 0 1px #ffffff0a}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}.section-heading h2{margin:0}.section-heading small{color:var(--muted)}.preflight{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.check{position:relative;min-width:0;padding:13px 13px 14px 15px;border:1px solid #2d3e61;border-radius:14px;background:linear-gradient(145deg,#16213a,#10182b);transition:transform .22s,border-color .22s,box-shadow .22s;animation:rise-in .55s both}.check:hover{transform:translateY(-2px);border-color:#5279a8;box-shadow:0 8px 24px #0003}.check strong{display:flex;align-items:center;gap:8px;font-size:12px;letter-spacing:.02em}.check small{display:block;color:var(--muted);font-size:11px;line-height:1.55;margin-top:5px;overflow-wrap:anywhere}
.guide-panel{display:grid;grid-template-columns:130px minmax(0,1fr);gap:22px;align-items:center;margin:22px 0;padding:20px 22px;border:1px solid #3c497a;border-radius:22px;background:radial-gradient(ellipse at 0 50%,#35438a66,transparent 60%),linear-gradient(115deg,#171d3b,#101a2d);box-shadow:0 14px 40px #0003}.bot-stage{height:120px;display:grid;place-items:center;position:relative;perspective:300px}.bot{position:relative;width:76px;height:68px;border:2px solid #77f8ed;border-radius:23px 23px 19px 19px;background:linear-gradient(145deg,#e8fffd,#91bdf5);box-shadow:0 0 28px #55f3e255,inset 0 -8px 0 #6d91c9;animation:bot-float 3.2s ease-in-out infinite}.bot:before{content:"";position:absolute;width:34px;height:10px;top:-13px;left:19px;border:2px solid var(--cyan);border-bottom:0;border-radius:12px 12px 0 0}.bot:after{content:"";position:absolute;left:33px;top:-22px;width:7px;height:7px;border-radius:50%;background:var(--pink);box-shadow:0 0 14px var(--pink);animation:pulse 1.5s infinite}.bot-eyes{position:absolute;left:14px;right:14px;top:23px;display:flex;justify-content:space-between}.bot-eyes i{width:11px;height:14px;background:#182744;border-radius:7px;box-shadow:0 0 7px #6da7ff66;animation:blink 5s infinite}.bot-mouth{position:absolute;width:18px;height:5px;left:27px;top:45px;border-radius:5px;background:#315277}.bot-ear{position:absolute;top:22px;width:8px;height:22px;border:2px solid var(--violet);border-radius:5px}.bot-ear.left{left:-9px}.bot-ear.right{right:-9px}.bot-shadow{position:absolute;bottom:5px;width:82px;height:12px;background:#55f3e222;border-radius:50%;filter:blur(5px);animation:shadow-pulse 3.2s ease-in-out infinite}.guide-copy{min-width:0}.guide-label{color:var(--violet);font-size:10px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.guide-copy h2{margin:4px 0 5px;font-size:18px}.guide-copy h2:before{display:none}.guide-copy p{margin:0;color:#c1cce5;font-size:13px;line-height:1.75}.guide-tip{display:inline-flex;gap:8px;align-items:flex-start;margin-top:10px;color:#8ff7e7;font-size:11px}.guide-tip:before{content:"TIP";padding:2px 6px;border:1px solid #3e827e;border-radius:5px;font-size:9px;font-weight:900;letter-spacing:.1em}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}label{display:grid;gap:7px;color:#cbd7f0;font-size:12px;font-weight:700;min-width:0}input,select{width:100%;min-width:0;background:#090f20;border:1px solid #38496f;border-radius:11px;color:var(--text);padding:13px 14px;font:inherit;transition:border-color .2s,box-shadow .2s,background .2s}input:hover,select:hover{border-color:#5a6f9a}input:focus,select:focus{outline:0;border-color:var(--cyan);box-shadow:0 0 0 3px #55f3e21b,0 0 22px #55f3e20d;background:#0c1729}.full{grid-column:1/-1}.help{font-size:11px;color:#9caccd;font-weight:400;line-height:1.65}input[type=checkbox]{width:17px;height:17px;accent-color:var(--cyan);vertical-align:middle;margin:0 7px 0 0}label:has(input[type=checkbox]){display:block;line-height:1.8}
.notice{padding:15px 17px;border-radius:14px;border:1px solid #385777;background:#12263c;color:#d1e9f6;margin:18px 0;overflow-wrap:anywhere}.notice:before{content:"INFO";display:inline-block;margin-right:9px;color:var(--cyan);font-size:10px;font-weight:900;letter-spacing:.13em}.notice.success{background:#10352f;border-color:#247a65;color:#b8ffe8}.notice.success:before{content:"READY";color:var(--good)}.notice.error{background:#3a1e31;border-color:#a64a70;color:#ffd3df}.notice.error:before{content:"ACTION REQUIRED";color:#ff9ab3}.notice code{color:#a3fff1;overflow-wrap:anywhere}
button{position:relative;isolation:isolate;background:linear-gradient(100deg,var(--cyan),#89f4d5);color:#06121e;border:1px solid #a2fff1;border-radius:12px;padding:13px 19px;font:inherit;font-weight:850;letter-spacing:.01em;cursor:pointer;box-shadow:0 7px 22px #55f3e21b;transition:transform .2s,box-shadow .2s,filter .2s}button:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 10px 28px #55f3e233;filter:brightness(1.06)}button:active:not(:disabled){transform:translateY(0)}button:disabled{opacity:.38;cursor:not-allowed;box-shadow:none;filter:saturate(.4)}.step-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:28px;padding-top:20px;border-top:1px solid #293958}.step-controls button.secondary{background:#182540;color:#e4edff;border-color:#3b4f77;box-shadow:none}.step-count{color:var(--muted);font-size:12px;text-align:center}
.steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:25px 0}.step-dot{position:relative;display:flex;align-items:center;gap:10px;min-width:0;padding:12px;border:1px solid #2d3e61;border-radius:14px;background:#0d1528;color:#8799bf;font-size:12px;text-align:left;transition:all .25s}.step-number{display:grid;place-items:center;flex:0 0 30px;height:30px;border-radius:10px;background:#202c48;color:#aab8d8;font-weight:900}.step-label{min-width:0;overflow-wrap:anywhere}.step-label small{display:block;font-size:10px;opacity:.7}.step-dot.active{border-color:var(--cyan);color:#eafffc;background:linear-gradient(135deg,#123b43,#172443);box-shadow:0 0 22px #55f3e214}.step-dot.active .step-number{background:linear-gradient(135deg,var(--cyan),var(--blue));color:#07111f;box-shadow:0 0 16px #55f3e233}.step-dot.complete{border-color:#327f6e;color:#b9ffe7}.step-dot.complete .step-number{background:#174a40;color:var(--good)}.step-panel{min-width:0;animation:panel-enter .35s ease-out}.step-panel[hidden]{display:none}.progress-track{height:5px;background:#202b45;border-radius:999px;overflow:hidden;margin-top:15px}.progress-fill{height:100%;width:0;background:linear-gradient(90deg,var(--cyan),var(--blue),var(--violet));border-radius:999px;box-shadow:0 0 14px #55f3e288;transition:width .35s ease}.stage-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:30px 0 18px}.stage-index{color:var(--cyan);font-size:11px;font-weight:900;letter-spacing:.15em;text-transform:uppercase}
@keyframes bot-float{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-8px) rotate(2deg)}}@keyframes shadow-pulse{0%,100%{transform:scaleX(1);opacity:.8}50%{transform:scaleX(.75);opacity:.4}}@keyframes blink{0%,45%,48%,100%{transform:scaleY(1)}46%,47%{transform:scaleY(.12)}}@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.82)}}@keyframes rise-in{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}@keyframes panel-enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:850px){.preflight{grid-template-columns:repeat(2,minmax(0,1fr))}.guide-panel{grid-template-columns:100px minmax(0,1fr);gap:15px}}@media(max-width:600px){.wrap{padding:10px}.card{border-radius:19px;padding:17px}.preflight,.grid{grid-template-columns:1fr}.full{grid-column:auto}.guide-panel{grid-template-columns:1fr;gap:6px;padding:14px}.bot-stage{height:95px}.steps{grid-template-columns:1fr;gap:7px}.step-dot{padding:8px 10px}.step-dot:not(.active):not(.complete){opacity:.72}.step-controls{display:grid;grid-template-columns:1fr 1fr}.step-count{grid-column:1/-1;grid-row:1}.step-controls button{width:100%;padding:12px 8px}.status-pill{font-size:9px}.brand{letter-spacing:.07em}}@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}
</style></head><body><main class="wrap"><section class="card"><div class="brand-row"><div class="brand"><span class="brand-mark" aria-hidden="true">A</span><span>ARBITRADE <span>/ INSTALLER</span></span></div><span class="status-pill">Guided setup system</span></div><div class="kicker">Deployment control center / 01</div><h1>Build your <span class="gradient">Arbitrade environment.</span></h1><p class="intro">Follow the steps one at a time. We explain what each field means, check your server requirements, and stop you from moving forward while a required item is missing.</p><div class="guide-panel" aria-live="polite"><div class="bot-stage" aria-hidden="true"><div class="bot-shadow"></div><div class="bot"><span class="bot-ear left"></span><span class="bot-ear right"></span><span class="bot-eyes"><i></i><i></i></span><span class="bot-mouth"></span></div></div><div class="guide-copy"><div class="guide-label">Your installation co-pilot</div><h2 id="guide-title">Let us check your launch systems</h2><p id="guide-message">First, review the server checklist below. Every required check must pass before the wizard can unlock the next stage.</p><div class="guide-tip" id="guide-tip">A green check means the item passed. A failed check tells you what needs attention.</div></div></div>
<div class="preflight-shell"><div class="section-heading"><h2>Launch readiness scan</h2><small>Required systems and deployment warnings</small></div><div class="preflight" aria-label="Server and application preflight checks">
<div class="check"><strong><?= PHP_VERSION_ID >= 80200 ? '✓' : '✕' ?> PHP <?=h(PHP_VERSION)?></strong><small><?= PHP_VERSION_ID >= 80200 ? 'PHP 8.2+ detected' : 'Action required: use PHP 8.2 or newer for the installer' ?></small></div>
<?php foreach ($extensionChecks as $extension => $available): ?>
<div class="check"><strong><?= $available ? '✓' : '✕' ?> <?=h($extension)?> extension</strong><small><?= $available ? 'Available' : 'Action required: enable ' . h($extension) . ' in cPanel PHP Extensions' ?></small></div>
<?php endforeach; ?>
<div class="check"><strong><?= $rootWritable ? '✓' : '✕' ?> Configuration directory</strong><small><?= $rootWritable ? 'Writable by PHP during setup' : 'Action required: allow PHP to write configuration during setup' ?></small></div>
<div class="check"><strong><?= $packageReady ? '✓' : '✕' ?> Application package</strong><small><?= $packageReady ? 'package.json and pnpm-lock.yaml found' : 'Upload the complete application package, including the lockfile' ?></small></div>
<div class="check"><strong><?= $nodeVersionValid ? '✓' : '✕' ?> Node.js runtime</strong><small><?= $nodeVersionValid ? 'Node.js ' . h($nodeVersionOutput) . ' detected' : 'Action required: make Node.js 20+ available to PHP, or set ARBITRADE_NODE_BINARY to its executable path' ?></small></div>
<div class="check"><strong><?= $pnpmVersionValid ? '✓' : '✕' ?> pnpm package manager</strong><small><?= $pnpmVersionValid ? 'pnpm ' . h($pnpmVersionOutput) . ' detected' : 'Action required: make pnpm 10.18.x available to PHP, or set ARBITRADE_PNPM_BINARY to its executable path' ?></small></div>
<div class="check"><strong><?= $nodeModulesReady ? '✓' : '✕' ?> Dependencies installed</strong><small><?= $nodeModulesReady ? 'pnpm installation metadata exists; the terminal installer will verify the frozen lockfile again' : 'Run pnpm install --frozen-lockfile from the private application root before continuing' ?></small></div>
<div class="check"><strong><?= $buildReady ? '✓' : '!' ?> Production build</strong><small><?= $buildReady ? 'dist/index.js exists' : 'Not built yet; build after configuring the environment' ?></small></div>
<div class="check"><strong><?= $httpsDetected ? '✓' : '!' ?> HTTPS</strong><small><?= $httpsDetected ? 'HTTPS detected for this request' : 'HTTPS not detected; enable SSL before production use' ?></small></div>
<div class="check"><strong><?= $diskFree === false ? '!' : ($diskFree > 1024 * 1024 * 1024 ? '✓' : '!') ?> Available disk</strong><small><?=h($diskFreeLabel)?><?= $diskFree !== false && $diskFree <= 1024 * 1024 * 1024 ? '; verify sufficient space before dependency installation/build' : '' ?></small></div>
<div class="check"><strong><?= $installerLocked ? '!' : '✓' ?> Installation state</strong><small><?= $installerLocked ? 'Existing configuration/lock detected; installer must not be reused' : 'No existing installation lock detected' ?></small></div>

</div><div class="progress-track" aria-label="Preflight readiness"><div class="progress-fill" id="preflight-progress" style="width:<?= $preflightBlocked ? '0%' : '100%' ?>"></div></div></div>
<p class="sub">All required PHP, Node.js, pnpm, installed-dependency, package, permission, and installation-state checks must pass before stage navigation or submission is enabled. If PHP cannot execute Node.js or pnpm, configure the corresponding binary path in the PHP hosting environment; do not bypass the preflight. The terminal installer rechecks the frozen lockfile before database migrations. Database credentials are checked privately when you submit the database step. Do not expose this wizard publicly after setup.</p>
<?php if($message):?><div class="notice success"><?=h($message)?><p><strong>Next step:</strong> in the application root, run <code>node installer/run-install.mjs --<?=h(postval('install_mode') === 'existing' ? 'existing-database --confirm-existing-migrations' : 'fresh-install')?></code> from the private cPanel terminal.</p></div><?php endif;?>
<?php if($error):?><div class="notice error"><?=h($error)?></div><?php endif;?>
<?php if(!$message && !installerPathExists($configuredLock) && !installerPathExists($installedLock) && !installerPathExists($envPath) && !installerPathExists($bootstrapPath)):?>
<form method="post" autocomplete="off"><input type="hidden" name="csrf" value="<?=h($csrf)?>">
<div class="stage-header"><div><div class="stage-index">Mission 01 / Choose your path</div><h2>Installation mode</h2><p class="sub">Tell the wizard whether this is a brand-new installation or a deployment using an existing database. Choose carefully to protect existing data.</p></div></div><div class="grid"><label class="full">Deployment type<select name="install_mode" id="install_mode" required><option value="fresh">Fresh installation — new empty database</option><option value="existing">Restore/migrate existing database — backup already imported</option></select></label>
<label class="full" id="backup-confirmation" hidden><span><input type="checkbox" name="backup_confirmed" value="1" style="width:auto"> I confirm I have a current, restorable backup and have imported the intended Arbitrade backup into the target database. I understand the installer will run forward migrations and will not import or overwrite the database itself.</span></label></div>
<div class="notice" id="database-mode-note">Fresh installation requires an empty database. For existing data, import the SQL backup using cPanel/phpMyAdmin or a trusted private terminal before continuing. Large SQL imports are intentionally not accepted over this public web form because host upload/time limits can truncate a restore. The installer records the database table inventory now and checks it again in the private terminal before migrations.</div>
<div class="stage-header"><div><div class="stage-index">Mission 02 / Connect the system</div><h2>Application and database</h2><p class="sub">Enter the public website address and the database credentials created in your hosting panel. These details let Arbitrade connect to its own database.</p></div></div><div class="grid">
<label class="full">Public application URL<input name="app_url" type="url" value="<?=h(postval('app_url') !== '' ? postval('app_url') : $detectedAppUrl)?>" placeholder="https://your-domain.com" autocomplete="url" required><span class="help"><?php if ($detectedAppUrl !== ''): ?>Detected from this request. Confirm it is the public URL users will visit; edit it if this host or proxy does not expose the final domain.<?php else: ?>Automatic detection was unavailable. Enter the public URL users will visit, such as https://your-domain.com. Do not use localhost for a production deployment.<?php endif; ?></span></label><label>Node application port<input name="port" value="3000" inputmode="numeric" required></label>
<label>Database host<input name="db_host" value="127.0.0.1" required></label><label>Database port<input name="db_port" value="3306" inputmode="numeric" required></label>
<label>Database name<input name="db_name" placeholder="arbitrade" required></label><label>Database username<input name="db_user" required></label>
<label>Database password<input name="db_pass" type="password" autocomplete="new-password"></label><label>Create database if permitted<select name="create_db"><option value="0">No — I created it in cPanel</option><option value="1">Yes — attempt CREATE DATABASE</option></select></label>
<label class="full"><span><input type="checkbox" name="allow_http" value="1" style="width:auto"> Allow HTTP for local testing only (not production)</span></label></div>
<div class="stage-header"><div><div class="stage-index">Mission 03 / Secure your access</div><h2>Initial accounts</h2><p class="sub">For a fresh installation, create separate administrator and customer logins. Existing-database deployments preserve existing account credentials.</p></div></div><div id="initial-accounts-section"><div class="grid"><label>Administrator email<input name="admin_email" type="email" maxlength="320" autocomplete="off"></label><label>Administrator password<input name="admin_password" type="password" minlength="12" maxlength="200" autocomplete="new-password"><span class="help">Between 12 and 200 characters. Held in a protected one-time file and deleted after successful account creation.</span></label><label>Initial customer email<input name="customer_email" type="email" maxlength="320" autocomplete="off"></label><label>Initial customer password<input name="customer_password" type="password" minlength="12" maxlength="200" autocomplete="new-password"><span class="help">Between 12 and 200 characters, and different from the administrator password. Held only in the protected one-time bootstrap and deleted after successful account creation.</span></label></div></div>
<div class="notice">Email delivery is intentionally not configured in this installer. No SMTP provider, server, port, username, password, API key, sender identity, or test-email recipient is collected here. Complete installation first, sign in to the administrator portal, then configure and test all application email delivery in Communications → Email &amp; SMTP Settings.</div>
<div class="step-controls"><button type="button" class="secondary" id="step-prev">Previous</button><span class="step-count" id="step-count" aria-live="polite"></span><button type="button" id="step-next">Next step</button><button type="submit" id="step-submit" hidden>Verify database &amp; save configuration</button></div></form>
<script>
const mode=document.getElementById('install_mode'),accountSection=document.getElementById('initial-accounts-section');
const preflightBlocked=<?= ($preflightBlocked ? 'true' : 'false') ?>;
const preflightBlockMessage='Resolve all failed server prerequisite checks before proceeding.';
const navigationControls=document.querySelector('.step-controls');
navigationControls.remove();
function updateMode(){const fresh=mode.value==='fresh';accountSection.hidden=!fresh;accountSection.querySelectorAll('input').forEach(input=>input.required=fresh);const backup=document.getElementById('backup-confirmation');backup.hidden=fresh;backup.querySelector('input').disabled=fresh;backup.querySelector('input').required=!fresh;document.getElementById('database-mode-note').textContent=fresh?'Fresh installation requires an empty database. The wizard creates both initial accounts after migrations.':'Import the intended SQL backup using cPanel/phpMyAdmin or a trusted private terminal before continuing. Large SQL imports are intentionally not accepted over this public web form because host upload/time limits can truncate a restore. Confirm you have a current restorable backup. The wizard records the database table inventory and checks it again in the private terminal before migrations; existing account credentials are preserved.';}
mode.addEventListener('change',updateMode);updateMode();
const form=document.querySelector('form'), headings=[...form.querySelectorAll(':scope > h2')], panels=[];
for(const heading of headings){const panel=document.createElement('section');panel.className='step-panel';heading.parentNode.insertBefore(panel,heading);let node=heading;while(node){const following=node.nextSibling;if(node!==heading&&node.tagName==='H2')break;panel.appendChild(node);node=following;}panels.push(panel);}
const nav=document.createElement('div');nav.className='steps';nav.setAttribute('aria-label','Installation progress');
const stageLabels=['Choose installation mode','Connect application & database','Create initial accounts'];const stageHints=['Choose safely','Enter connection details','Secure first logins'];panels.forEach((panel,i)=>{const dot=document.createElement('div');dot.className='step-dot';dot.innerHTML='<span class="step-number">'+(i+1)+'</span><span class="step-label">'+stageLabels[i]+'<small>'+stageHints[i]+'</small></span>';nav.appendChild(dot);});
form.insertBefore(nav,panels[0]);
form.appendChild(navigationControls);
const prev=document.getElementById('step-prev'),next=document.getElementById('step-next'),submit=document.getElementById('step-submit'),count=document.getElementById('step-count');let current=0;
function currentStepValid(){for(const field of panels[current].querySelectorAll('input,select')){if(field.disabled||field.type==='checkbox'&&!field.required)continue;if(!field.checkValidity())return false;}return true;}
const guideStages=[{title:'Choose your installation path',message:'Choose Fresh installation only for an empty database. Choose Existing database only after you have imported the intended backup and confirmed a restorable backup exists.',tip:'When in doubt, stop and verify the database before continuing.'},{title:'Connect Arbitrade to your server',message:'Use the public URL customers will visit and the database name, username, and password from your hosting panel. The database password is sent only when you submit this protected form.',tip:'Do not paste your hosting account password here; use the dedicated database user.'},{title:'Secure your first accounts',message:'For a fresh install, use different email addresses and strong, different passwords for the administrator and initial customer. Existing-database mode keeps existing accounts unchanged.',tip:'SMTP is configured later from the authenticated administrator portal, not here.'}];function updateGuide(){const stage=guideStages[current]||guideStages[0];document.getElementById('guide-title').textContent=stage.title;document.getElementById('guide-message').textContent=stage.message;document.getElementById('guide-tip').textContent=stage.tip;const progress=document.getElementById('preflight-progress');if(progress)progress.style.width=preflightBlocked?'0%':'100%';}function showStep(index){current=Math.max(0,Math.min(index,panels.length-1));panels.forEach((p,i)=>p.hidden=i!==current);[...nav.children].forEach((d,i)=>{d.classList.toggle('active',i===current);d.classList.toggle('complete',i<current);d.setAttribute('aria-current',i===current?'step':'false');});prev.disabled=current===0;next.hidden=current===panels.length-1;submit.hidden=current!==panels.length-1;count.textContent='STEP '+(current+1)+' OF '+panels.length;form.querySelectorAll('[data-step-invalid]').forEach(el=>el.removeAttribute('data-step-invalid'));next.disabled=preflightBlocked||!currentStepValid();submit.disabled=preflightBlocked||!currentStepValid();updateGuide();}
form.addEventListener('input',()=>{next.disabled=preflightBlocked||!currentStepValid();submit.disabled=preflightBlocked||!currentStepValid();});
form.addEventListener('change',()=>{next.disabled=preflightBlocked||!currentStepValid();submit.disabled=preflightBlocked||!currentStepValid();});
prev.addEventListener('click',()=>showStep(current-1));
next.addEventListener('click',()=>{if(preflightBlocked){window.alert(preflightBlockMessage);return;}for(const field of panels[current].querySelectorAll('input,select')){if(field.disabled||field.type==='checkbox'&&!field.required)continue;if(!field.checkValidity()){field.reportValidity();return;}}showStep(current+1);});
form.addEventListener('submit',event=>{if(preflightBlocked){event.preventDefault();window.alert(preflightBlockMessage);return;}for(const field of form.querySelectorAll('input,select')){if(field.disabled)continue;if(!field.checkValidity()){event.preventDefault();field.reportValidity();return;}}});
showStep(0);if(preflightBlocked){document.getElementById('guide-title').textContent='Launch checks need attention';document.getElementById('guide-message').textContent='The wizard is safely locked until every required server prerequisite passes. Follow the failed checklist messages above; Next and submit remain disabled.';document.getElementById('guide-tip').textContent='Correct the server setup, then reload this page. Do not bypass the checks.';}
</script>
<?php elseif(!$message):?><div class="notice error">This installer is locked. Configuration or an installation lock already exists.</div><?php endif;?>
</section></main></body></html>
