<?php
declare(strict_types=1);

$root = dirname(__DIR__);
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
session_set_cookie_params(['httponly' => true, 'secure' => $isHttps, 'samesite' => 'Strict']);
session_start();

function h(string $value): string { return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function postval(string $key): string { return trim((string)($_POST[$key] ?? '')); }

$title = 'SMTP test';
$success = false;
$message = '';
$details = '';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    $message = 'Use the SMTP test button in the installation wizard.';
} elseif (file_exists($root . '/.env') || file_exists($root . '/.configured') || file_exists(__DIR__ . '/.installed')) {
    http_response_code(403);
    $message = 'The installer SMTP test is available only before configuration is saved. Do not remove installation locks to reuse it.';
} elseif (empty($_SESSION['installer_csrf']) || !hash_equals((string)$_SESSION['installer_csrf'], postval('csrf'))) {
    http_response_code(403);
    $message = 'Your installer session expired. Return to the wizard, refresh, and try again.';
} else {
    try {
        if (postval('mail_provider') !== 'smtp') throw new RuntimeException('Select SMTP as the mail provider in the wizard first.');
        $host = postval('smtp_host');
        $portRaw = postval('smtp_port') ?: '587';
        $user = postval('smtp_user');
        $password = (string)($_POST['smtp_pass'] ?? '');
        $fromEmail = postval('from_email');
        $fromName = postval('from_name') ?: 'Arbitrade';
        $recipient = postval('smtp_test_to');
        if ($host === '' || preg_match('/[\r\n\s]/', $host)) throw new RuntimeException('Enter a valid SMTP hostname.');
        if (!ctype_digit($portRaw) || (int)$portRaw < 1 || (int)$portRaw > 65535) throw new RuntimeException('SMTP port must be between 1 and 65535.');
        if ($user === '' || $password === '') throw new RuntimeException('Enter the SMTP username and password.');
        if (!filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) throw new RuntimeException('Enter a valid sender email address.');
        if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) throw new RuntimeException('Enter a valid test recipient email address.');
        if (strlen($fromName) > 120) throw new RuntimeException('Sender display name must be 120 characters or fewer.');
        if (!is_file($root . '/installer/test-smtp.mjs') || !is_dir($root . '/node_modules/nodemailer') || !is_dir($root . '/node_modules/dotenv')) {
            throw new RuntimeException('The SMTP test dependencies are not installed. After configuration, use the private terminal command: pnpm installer:test-smtp --to=you@example.com');
        }
        if (!function_exists('proc_open')) throw new RuntimeException('This cPanel PHP configuration disables process execution. After installation, test SMTP from the private terminal using: pnpm installer:test-smtp --to=you@example.com');
        $node = '';
        $pathValue = (string)(getenv('PATH') ?: '');
        foreach (explode(PATH_SEPARATOR, $pathValue) as $directory) {
            if ($directory === '') continue;
            $candidate = rtrim($directory, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'node';
            if (is_file($candidate) && is_executable($candidate)) { $node = $candidate; break; }
        }
        if ($node === '') throw new RuntimeException('Node.js is not available in the PHP web process PATH. After installation, use the private cPanel terminal SMTP test command.');
        $env = [
            'PATH' => $pathValue,
            'MAIL_PROVIDER' => 'smtp',
            'SMTP_HOST' => $host,
            'SMTP_PORT' => (string)(int)$portRaw,
            'SMTP_SECURE' => postval('smtp_secure') === '1' ? 'true' : 'false',
            'SMTP_USER' => $user,
            'SMTP_PASSWORD' => $password,
            'SMTP_FROM_EMAIL' => $fromEmail,
            'SMTP_FROM_NAME' => $fromName,
        ];
        foreach (['HOME', 'TMPDIR', 'TEMP', 'SystemRoot'] as $key) {
            $value = getenv($key);
            if ($value !== false) $env[$key] = $value;
        }
        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];
        $process = proc_open([$node, $root . '/installer/test-smtp.mjs', '--to=' . $recipient], $descriptors, $pipes, $root, $env, ['bypass_shell' => true]);
        if (!is_resource($process)) throw new RuntimeException('Could not start the SMTP test process. Use the private terminal command after installation.');
        fclose($pipes[0]);
        stream_set_timeout($pipes[1], 35);
        stream_set_timeout($pipes[2], 35);
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $exitCode = proc_close($process);
        $combined = trim((string)$stdout . "\n" . (string)$stderr);
        if ($exitCode === 0) {
            $success = true;
            $message = 'SMTP connection/authentication succeeded and the test email was accepted by the SMTP server.';
            $details = $combined;
        } else {
            $message = 'SMTP test failed. Check the hostname, port, TLS mode, credentials, sender authorization, and hosting-provider outbound SMTP restrictions.';
            $details = $combined !== '' ? $combined : 'The test process returned a failure without diagnostic output.';
            http_response_code(422);
        }
    } catch (Throwable $e) {
        $message = $e->getMessage();
        http_response_code(422);
    }
}
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title><?=h($title)?></title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#07111f;color:#dbe9ef;font:14px/1.6 system-ui,-apple-system,sans-serif}.wrap{max-width:720px;margin:32px auto;padding:0 16px}.card{background:#102033;border:1px solid #29445a;border-radius:16px;padding:clamp(18px,4vw,32px)}h1{font-size:25px;margin-top:0}.notice{padding:14px;border-radius:8px;overflow-wrap:anywhere;background:<?= $success ? "'#153a36'" : "'#48252e'" ?>;color:<?= $success ? "'#a4f0d8'" : "'#ffc0c7'" ?>}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#091624;padding:12px;border-radius:8px;color:#b7d5e0}p{color:#91aab8}a{color:#70e0c4}
</style></head><body><main class="wrap"><section class="card"><h1>SMTP configuration test</h1><div class="notice"><?=h($message)?></div>
<?php if ($details !== ''): ?><h2>Test result</h2><pre><?=h($details)?></pre><?php endif; ?>
<p>This test does not save configuration. SMTP credentials are not displayed. A successful result means the SMTP server accepted the message; it does not guarantee delivery to the recipient's inbox.</p><p><a href="index.php" target="_blank" rel="noopener">Return to the installation wizard</a></p></section></main></body></html>
