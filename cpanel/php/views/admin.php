<?php $displayName = $user['name'] ?: $user['email']; ?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#031020"><title>Admin Operations · Arbitrade</title>
  <link rel="stylesheet" href="/assets/portal.css">
</head>
<body class="customer-portal admin-portal">
  <header class="portal-header">
    <a class="brand-lockup" href="/ops-console-7f3a"><img src="/assets/arbitrade-mark.svg" alt=""><span class="brand-name"><strong>Arbitrade</strong><span>Admin Operations</span></span></a>
    <div class="portal-header-context"><i></i> TREASURY&nbsp;&nbsp; • &nbsp;&nbsp;RISK&nbsp;&nbsp; • &nbsp;&nbsp;SUPPORT</div>
    <div class="portal-session"><span class="avatar">A</span><span><strong><?= h($displayName) ?></strong><small>Verified role: administrator</small></span><form method="post" action="/logout"><input type="hidden" name="_csrf" value="<?= h($csrf) ?>"><button class="secondary-button" type="submit">Log out</button></form></div>
  </header>
  <div class="portal-body">
    <aside class="customer-primary-rail"><div class="rail-main"><nav aria-label="Admin operations">
      <a class="active" href="#overview"><span class="nav-icon">⌂</span><span>Overview</span></a>
      <a href="#customers"><span class="nav-icon">♙</span><span>Customers</span></a>
      <a href="#treasury"><span class="nav-icon">▣</span><span>Treasury</span></a>
      <a href="#opportunities"><span class="nav-icon">◈</span><span>Opportunities</span></a>
      <a href="#kyc"><span class="nav-icon">◇</span><span>KYC Review</span></a>
      <a href="#support"><span class="nav-icon">◉</span><span>Support</span></a>
      <a href="#settings"><span class="nav-icon">⚙</span><span>Settings</span></a>
    </nav></div><div class="rail-promo"><div class="promo-art">↗</div><strong>Operations<br>workspace</strong><span>Secure · Ledger-backed</span></div></aside>
    <main class="portal-main" id="overview"><div class="portal-page">
      <section class="market-hero admin-hero"><div class="hero-copy"><div class="eyebrow">› &nbsp;ADMIN OPERATIONS</div><h1>Welcome back, <?= h($displayName) ?>.</h1><p>Current account and support totals are read from MySQL. Actions remain disabled until their PHP handlers pass parity and security tests.</p><span class="market-status"><i></i> Database connected · <?= h(date('d M Y H:i')) ?></span></div><div class="hero-callout"><span class="callout-icon">✓</span><span><strong>Administrator role verified</strong><small>This view is protected by a server-side role check.</small></span></div></section>
      <section class="admin-stat-grid"><article><span class="stat-icon">♙</span><small>Customer accounts</small><strong><?= h(number_format($stats['customers'])) ?></strong></article><article><span class="stat-icon">◆</span><small>Admin accounts</small><strong><?= h(number_format($stats['admins'])) ?></strong></article><article><span class="stat-icon">◉</span><small>Open support tickets</small><strong><?= h(number_format($stats['openTickets'])) ?></strong></article></section>
      <section class="ledger-card" id="customers"><div class="ledger-heading"><div><div class="section-kicker">CUSTOMER DIRECTORY</div><h2>Accounts</h2><p>Read-only directory for the first PHP migration phase.</p></div><span class="soft-pill">Up to 50</span></div>
        <div class="migration-notice"><span>!</span><span><strong>Migration status: read-only</strong><small>Editing users, KYC decisions, wallet adjustments, opportunities, and support operations are not yet enabled in this PHP phase.</small></span></div>
        <div class="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Package</th><th>Created</th></tr></thead><tbody>
          <?php foreach ($customers as $account): ?><tr><td><?= h($account['name'] ?: '—') ?></td><td><?= h($account['email'] ?: '—') ?></td><td><span class="role-chip"><?= h($account['role']) ?></span></td><td><?= h($account['packageName']) ?></td><td><?= h($account['createdAt']) ?></td></tr><?php endforeach; ?>
        </tbody></table></div>
      </section>
      <footer class="page-footer">Arbitrade · Admin operations · <?= h(date('Y')) ?></footer>
    </div></main>
  </div>
</body>
</html>
