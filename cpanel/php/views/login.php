<?php
$next = (string)($_GET['next'] ?? $_POST['next'] ?? '');
$hintLabel = ($hint ?? 'customer') === 'admin' ? 'Administrator access' : 'Customer access';
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#031020"><title>Sign in · Arbitrade</title>
  <link rel="stylesheet" href="/assets/portal.css">
</head>
<body class="customer-portal login-screen">
  <header class="portal-header login-header">
    <a class="brand-lockup" href="/login"><img src="/assets/arbitrade-mark.svg" alt=""><span class="brand-name"><strong>Arbitrade</strong><span>Customer Workspace</span></span></a>
    <div class="portal-header-context">TRADE&nbsp;&nbsp; • &nbsp;&nbsp;EARN&nbsp;&nbsp; • &nbsp;&nbsp;GROW</div>
  </header>
  <main class="login-wrap">
    <section class="login-card">
      <div class="eyebrow"><i></i> SECURE PORTAL SIGN-IN</div>
      <h1>Welcome back.</h1>
      <p class="muted">Sign in to the role assigned to your account. The server checks the database role; selecting a portal cannot grant administrator access.</p>
      <div class="portal-hint"><?= h($hintLabel) ?></div>
      <?php if (!empty($message)): ?><p class="login-error" role="alert"><?= h($message) ?></p><?php endif; ?>
      <form method="post" action="/login" autocomplete="on">
        <input type="hidden" name="_csrf" value="<?= h($csrf) ?>">
        <input type="hidden" name="portal_hint" value="<?= h($hint ?? 'customer') ?>">
        <input type="hidden" name="next" value="<?= h($next) ?>">
        <label for="email">Email address</label>
        <input id="email" name="email" type="email" autocomplete="username" maxlength="320" required autofocus>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <button class="primary-button" type="submit">Sign in securely</button>
      </form>
      <p class="login-footnote">Protected by your account role and an HTTP-only session cookie.</p>
    </section>
  </main>
</body>
</html>
