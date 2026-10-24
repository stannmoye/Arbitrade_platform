<?php
declare(strict_types=1);
$root = dirname(__DIR__);
$configuredLock = $root . '/.configured';
$installedLock = __DIR__ . '/.installed';
$envPath = $root . '/.env';
$bootstrapPath = $root . '/.installer-bootstrap.json';

/** Treat dangling symlinks as existing protected state; file_exists() alone misses them. */
function installerPathExists(string $path): bool {
    return file_exists($path) || is_link($path);
}

if (installerPathExists($configuredLock) || installerPathExists($installedLock) || installerPathExists($envPath) || installerPathExists($bootstrapPath)) {
    http_response_code(403);
    exit('The installer is locked because configuration already exists. Do not delete lock files to reinstall over an existing site.');
}
$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
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

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        if (!hash_equals($csrf, postval('csrf'))) throw new RuntimeException('Your installer session expired. Refresh and try again.');
        if (PHP_VERSION_ID < 80200) throw new RuntimeException('PHP 8.2 or newer is required for the installer. Select a supported PHP version in cPanel and reload this page.');
        $missingExtensions = array_values(array_filter(['pdo_mysql', 'openssl', 'json', 'mbstring'], static fn(string $extension): bool => !extension_loaded($extension)));
        if ($missingExtensions !== []) throw new RuntimeException('Enable these required PHP extensions in cPanel before continuing: ' . implode(', ', $missingExtensions) . '.');
        if (!is_file($root . '/package.json') || !is_file($root . '/pnpm-lock.yaml')) throw new RuntimeException('The application package is incomplete. Upload the complete Arbitrade ZIP, including package.json and pnpm-lock.yaml.');
        if (!is_writable($root)) throw new RuntimeException('The application root is not writable by PHP. Adjust deployment permissions, save configuration, then remove write access after installation.');
        $mode = postval('install_mode');
        if (!in_array($mode, ['fresh', 'existing'], true)) throw new RuntimeException('Choose a fresh installation or an existing-database deployment.');
        $appUrl = rtrim(postval('app_url'), '/');
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
        if ($mode === 'fresh') {
            if (!filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) throw new RuntimeException('Enter a valid administrator email for a fresh installation.');
            if (strlen($adminPassword) < 12) throw new RuntimeException('Administrator password must be at least 12 characters.');
        } else {
            $adminEmail = '';
            $adminPassword = '';
        }
        $appPort = validPort(postval('port'), 3000);
        $databaseUrl = 'mysql://' . rawurlencode($dbUser) . ':' . rawurlencode($dbPass) . '@' . (str_contains($dbHost, ':') && !str_starts_with($dbHost, '[') ? '[' . $dbHost . ']' : $dbHost) . ':' . $dbPort . '/' . $dbName;

        $lines = [
            'NODE_ENV="production"', 'PORT="' . $appPort . '"',
            envline('PUBLIC_APP_URL', $appUrl), envline('DATABASE_URL', $databaseUrl),
            envline('SESSION_SECRET', bin2hex(random_bytes(32))), envline('PASSWORD_PEPPER', bin2hex(random_bytes(32))),
            // Optional providers are deliberately left unconfigured during installation.
            // Configure supported integrations after the administrator can sign in.
            'MAIL_PROVIDER="disabled"',
            envline('ADMIN_EMAIL', $adminEmail),
        ];
        $bootstrap = json_encode([
            'mode' => $mode,
            'adminEmail' => $adminEmail,
            'adminPassword' => $adminPassword,
            'databaseTableCount' => $tableCount,
            'databaseTableNames' => $tableNames,
            'backupConfirmed' => $mode === 'existing' && $backupConfirmed,
            'databaseCheckedAt' => gmdate('c'),
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        $envTmp = $root . '/.env.installing.' . bin2hex(random_bytes(6));
        $bootstrapTmp = $root . '/.installer-bootstrap.tmp.' . bin2hex(random_bytes(6));
        if (file_put_contents($envTmp, implode("\n", $lines) . "\n", LOCK_EX) === false) throw new RuntimeException('Could not write environment configuration. Check application-directory permissions.');
        chmod($envTmp, 0600);
        if (file_put_contents($bootstrapTmp, $bootstrap, LOCK_EX) === false) { @unlink($envTmp); throw new RuntimeException('Could not write the one-time administrator bootstrap.'); }
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
$httpsDetected = $isHttps || (isset($_SERVER['REQUEST_SCHEME']) && strtolower((string)$_SERVER['REQUEST_SCHEME']) === 'https');
$requiredExtensions = ['pdo_mysql', 'openssl', 'json', 'mbstring'];
$extensionChecks = [];
foreach ($requiredExtensions as $extension) $extensionChecks[$extension] = extension_loaded($extension);
$nodeModulesReady = is_dir($root . '/node_modules');
$buildReady = is_file($root . '/dist/index.js');
$packageReady = is_file($root . '/package.json') && is_file($root . '/pnpm-lock.yaml');
$installerLocked = installerPathExists($configuredLock) || installerPathExists($installedLock) || installerPathExists($envPath) || installerPathExists($bootstrapPath);
$rootWritable = is_writable($root);
$diskFreeLabel = $diskFree === false ? 'Unavailable on this host' : (string)round($diskFree / 1024 / 1024) . ' MB free';
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Arbitrade installation wizard</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#07111f;color:#dbe9ef;font:14px/1.5 system-ui,-apple-system,sans-serif}.wrap{max-width:960px;margin:32px auto;padding:0 16px}.card{background:#102033;border:1px solid #29445a;border-radius:16px;padding:clamp(18px,4vw,32px);box-shadow:0 20px 70px #0005}.brand{font-size:22px;font-weight:750;letter-spacing:.02em;color:#eaf7f4}.kicker{color:#70e0c4;font-size:11px;letter-spacing:.16em;text-transform:uppercase;margin:24px 0 8px}h1{margin:0 0 8px;font-size:clamp(25px,4vw,34px);line-height:1.15}h2{font-size:16px;border-top:1px solid #29445a;padding-top:22px;margin-top:28px}.sub{color:#91aab8;line-height:1.7}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}label{display:grid;gap:6px;color:#b4c8d2;font-size:12px}input,select{width:100%;min-width:0;background:#091624;border:1px solid #36546a;border-radius:8px;color:#eaf7f4;padding:11px;font:inherit}input:focus,select:focus{outline:2px solid #70e0c4;outline-offset:1px}.full{grid-column:1/-1}.notice{padding:13px 15px;border-radius:8px;background:#173246;color:#b7d5e0;margin:16px 0;overflow-wrap:anywhere}.success{background:#153a36;color:#a4f0d8}.error{background:#48252e;color:#ffc0c7}button{background:#70e0c4;color:#07111f;border:0;border-radius:8px;padding:13px 18px;font-weight:750;cursor:pointer}.actions{display:flex;justify-content:flex-end;margin-top:26px}.help{font-size:12px;color:#91aab8}.steps{display:flex;gap:8px;margin:22px 0}.step-dot{flex:1;padding:8px 4px;text-align:center;border:1px solid #36546a;border-radius:8px;color:#91aab8;font-size:11px}.step-dot.active{border-color:#70e0c4;color:#70e0c4;background:#153a36}.step-panel{min-width:0}.step-controls{display:flex;justify-content:space-between;gap:12px;margin-top:24px}.step-controls button.secondary{background:#29445a;color:#eaf7f4}.step-controls button:disabled{opacity:.45;cursor:not-allowed}.preflight{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.check{padding:10px;border:1px solid #29445a;border-radius:8px}.check strong{display:block;font-size:12px}.check small{color:#91aab8}.@media(max-width:650px){.preflight{grid-template-columns:1fr}.step-dot{font-size:10px}}@media(max-width:650px){.grid{grid-template-columns:1fr}.full{grid-column:auto}.actions button{width:100%}}
</style></head><body><main class="wrap"><section class="card"><div class="brand">ARBITRADE <span style="color:#70e0c4">/ INSTALLER</span></div><div class="kicker">Guided deployment</div><h1>Configure your installation</h1>
<div class="preflight" aria-label="Server and application preflight checks">
<div class="check"><strong><?= PHP_VERSION_ID >= 80200 ? '✓' : '✕' ?> PHP <?=h(PHP_VERSION)?></strong><small><?= PHP_VERSION_ID >= 80200 ? 'PHP 8.2+ detected' : 'Action required: use PHP 8.2 or newer for the installer' ?></small></div>
<?php foreach ($extensionChecks as $extension => $available): ?>
<div class="check"><strong><?= $available ? '✓' : '✕' ?> <?=h($extension)?> extension</strong><small><?= $available ? 'Available' : 'Action required: enable ' . h($extension) . ' in cPanel PHP Extensions' ?></small></div>
<?php endforeach; ?>
<div class="check"><strong><?= $rootWritable ? '✓' : '✕' ?> Configuration directory</strong><small><?= $rootWritable ? 'Writable by PHP during setup' : 'Action required: allow PHP to write configuration during setup' ?></small></div>
<div class="check"><strong><?= $packageReady ? '✓' : '✕' ?> Application package</strong><small><?= $packageReady ? 'package.json and pnpm-lock.yaml found' : 'Upload the complete application package, including the lockfile' ?></small></div>
<div class="check"><strong><?= $nodeModulesReady ? '✓' : '!' ?> Dependencies</strong><small><?= $nodeModulesReady ? 'node_modules directory exists; package integrity is not yet verified' : 'Not installed yet; requires Node.js/pnpm terminal or supported host automation' ?></small></div>
<div class="check"><strong><?= $buildReady ? '✓' : '!' ?> Production build</strong><small><?= $buildReady ? 'dist/index.js exists' : 'Not built yet; build after configuring the environment' ?></small></div>
<div class="check"><strong><?= $httpsDetected ? '✓' : '!' ?> HTTPS</strong><small><?= $httpsDetected ? 'HTTPS detected for this request' : 'HTTPS not detected; enable SSL before production use' ?></small></div>
<div class="check"><strong><?= $diskFree === false ? '!' : ($diskFree > 1024 * 1024 * 1024 ? '✓' : '!') ?> Available disk</strong><small><?=h($diskFreeLabel)?><?= $diskFree !== false && $diskFree <= 1024 * 1024 * 1024 ? '; verify sufficient space before dependency installation/build' : '' ?></small></div>
<div class="check"><strong><?= $installerLocked ? '!' : '✓' ?> Installation state</strong><small><?= $installerLocked ? 'Existing configuration/lock detected; installer must not be reused' : 'No existing installation lock detected' ?></small></div>
<div class="check"><strong>! Node.js runtime</strong><small>PHP cannot reliably detect the Node.js version on shared hosting. Verify Node.js 20+ in cPanel Setup Node.js App; the terminal installer performs its own version check.</small></div>
</div>
<p class="sub">This preflight checks what PHP can reliably observe. Node.js runtime/version and live dependency health are explicitly marked for verification in the hosting environment rather than guessed. Critical PHP extension and write-permission failures block configuration submission. Database credentials are checked privately when you submit the database step. Do not expose this wizard publicly after setup.</p>
<?php if($message):?><div class="notice success"><?=h($message)?><p><strong>Next step:</strong> in the application root, run <code>node installer/run-install.mjs --<?=h(postval('install_mode') === 'existing' ? 'existing-database --confirm-existing-migrations' : 'fresh-install')?></code> from the private cPanel terminal.</p></div><?php endif;?>
<?php if($error):?><div class="notice error"><?=h($error)?></div><?php endif;?>
<?php if(!$message && !installerPathExists($configuredLock) && !installerPathExists($installedLock) && !installerPathExists($envPath) && !installerPathExists($bootstrapPath)):?>
<form method="post" autocomplete="off"><input type="hidden" name="csrf" value="<?=h($csrf)?>">
<h2>1. Installation mode</h2><div class="grid"><label class="full">Deployment type<select name="install_mode" id="install_mode" required><option value="fresh">Fresh installation — new empty database</option><option value="existing">Restore/migrate existing database — backup already imported</option></select></label>
<label class="full" id="backup-confirmation" hidden><span><input type="checkbox" name="backup_confirmed" value="1" style="width:auto"> I confirm I have a current, restorable backup and have imported the intended Arbitrade backup into the target database. I understand the installer will run forward migrations and will not import or overwrite the database itself.</span></label></div>
<div class="notice" id="database-mode-note">Fresh installation requires an empty database. For existing data, import the SQL backup using cPanel/phpMyAdmin or a trusted private terminal before continuing. Large SQL imports are intentionally not accepted over this public web form because host upload/time limits can truncate a restore. The installer records the database table inventory now and checks it again in the private terminal before migrations.</div>
<h2>2. Application and database</h2><div class="grid">
<label class="full">Public application URL<input name="app_url" placeholder="https://example.com" required></label><label>Node application port<input name="port" value="3000" inputmode="numeric" required></label>
<label>Database host<input name="db_host" value="127.0.0.1" required></label><label>Database port<input name="db_port" value="3306" inputmode="numeric" required></label>
<label>Database name<input name="db_name" placeholder="arbitrade" required></label><label>Database username<input name="db_user" required></label>
<label>Database password<input name="db_pass" type="password" autocomplete="new-password"></label><label>Create database if permitted<select name="create_db"><option value="0">No — I created it in cPanel</option><option value="1">Yes — attempt CREATE DATABASE</option></select></label>
<label class="full"><span><input type="checkbox" name="allow_http" value="1" style="width:auto"> Allow HTTP for local testing only (not production)</span></label></div>
<h2>3. Initial administrator (fresh install only)</h2><div id="admin-section"><div class="grid"><label>Administrator email<input name="admin_email" type="email" autocomplete="off"></label><label>Administrator password<input name="admin_password" type="password" minlength="12" autocomplete="new-password"><span class="help">At least 12 characters. Held in a protected one-time file and deleted after successful account creation.</span></label></div></div>
<div class="notice">Email delivery and optional sign-in providers are left disabled during installation. Configure supported integrations after the application is running and an administrator can sign in.</div>
<div class="step-controls"><button type="button" class="secondary" id="step-prev">Previous</button><span class="help" id="step-count" aria-live="polite"></span><button type="button" id="step-next">Next step</button><button type="submit" id="step-submit" hidden>Verify database &amp; save configuration</button></div></form>
<script>
const mode=document.getElementById('install_mode'),adminSection=document.getElementById('admin-section');
function updateMode(){const fresh=mode.value==='fresh';adminSection.hidden=!fresh;adminSection.querySelector('[name="admin_email"]').required=fresh;adminSection.querySelector('[name="admin_password"]').required=fresh;const backup=document.getElementById('backup-confirmation');backup.hidden=fresh;backup.querySelector('input').disabled=fresh;backup.querySelector('input').required=!fresh;document.getElementById('database-mode-note').textContent=fresh?'Fresh installation requires an empty database. The wizard checks this before saving configuration.':'Import the intended SQL backup using cPanel/phpMyAdmin or a trusted private terminal before continuing. Large SQL imports are intentionally not accepted over this public web form because host upload/time limits can truncate a restore. Confirm you have a current restorable backup. The wizard records the database table inventory and checks it again in the private terminal before migrations.';}
mode.addEventListener('change',updateMode);updateMode();
const form=document.querySelector('form'), headings=[...form.querySelectorAll(':scope > h2')], panels=[];
for(const heading of headings){const panel=document.createElement('section');panel.className='step-panel';heading.parentNode.insertBefore(panel,heading);let node=heading;while(node){const following=node.nextSibling;if(node!==heading&&node.tagName==='H2')break;panel.appendChild(node);node=following;}panels.push(panel);}
const nav=document.createElement('div');nav.className='steps';nav.setAttribute('aria-label','Installation progress');
panels.forEach((panel,i)=>{const dot=document.createElement('div');dot.className='step-dot';dot.textContent=(i+1)+' / '+panels.length;nav.appendChild(dot);});
form.insertBefore(nav,panels[0]);
const prev=document.getElementById('step-prev'),next=document.getElementById('step-next'),submit=document.getElementById('step-submit'),count=document.getElementById('step-count');let current=0;
function showStep(index){current=Math.max(0,Math.min(index,panels.length-1));panels.forEach((p,i)=>p.hidden=i!==current);[...nav.children].forEach((d,i)=>d.classList.toggle('active',i===current));prev.disabled=current===0;next.hidden=current===panels.length-1;submit.hidden=current!==panels.length-1;count.textContent='Step '+(current+1)+' of '+panels.length;form.querySelectorAll('[data-step-invalid]').forEach(el=>el.removeAttribute('data-step-invalid'));}
prev.addEventListener('click',()=>showStep(current-1));
next.addEventListener('click',()=>{for(const field of panels[current].querySelectorAll('input,select')){if(field.disabled||field.type==='checkbox'&&!field.required)continue;if(!field.checkValidity()){field.reportValidity();return;}}showStep(current+1);});
form.addEventListener('submit',event=>{if(event.submitter&&event.submitter.name==='action'&&event.submitter.value==='smtp_test')return;for(const field of panels[current].querySelectorAll('input,select')){if(field.disabled)continue;if(!field.checkValidity()){event.preventDefault();field.reportValidity();return;}}});
showStep(0);
</script>
<?php elseif(!$message):?><div class="notice error">This installer is locked. Configuration or an installation lock already exists.</div><?php endif;?>
</section></main></body></html>
