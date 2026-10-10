<?php
$displayName = $user['name'] ?: $user['email'];
$initial = strtoupper(substr((string)$displayName, 0, 1));
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#031020"><title>Customer Workspace · Arbitrade</title>
  <link rel="stylesheet" href="/assets/portal.css">
</head>
<body class="customer-portal">
  <header class="portal-header">
    <a class="brand-lockup" href="/customer"><img src="/assets/arbitrade-mark.svg" alt=""><span class="brand-name"><strong>Arbitrade</strong><span>Customer Workspace</span></span></a>
    <div class="portal-header-context"><i></i> TRADE&nbsp;&nbsp; • &nbsp;&nbsp;EARN&nbsp;&nbsp; • &nbsp;&nbsp;GROW</div>
    <div class="portal-session"><span class="avatar"><?= h($initial) ?></span><span><strong><?= h($displayName) ?></strong><small>Verified role: customer</small></span><form method="post" action="/logout"><input type="hidden" name="_csrf" value="<?= h($csrf) ?>"><button class="secondary-button" type="submit">Log out</button></form></div>
  </header>
  <div class="portal-body">
    <aside class="customer-primary-rail">
      <div class="rail-main">
        <nav aria-label="Customer workspace">
          <a class="active" href="#dashboard"><span class="nav-icon">⌂</span><span>Home</span></a>
          <a href="#opportunities"><span class="nav-icon">◈</span><span>Trade Ideas</span><b class="pill">PRO</b></a>
          <a href="#stake"><span class="nav-icon">▥</span><span>Stake &amp; Earn</span><b class="pill">PRO</b></a>
          <a href="#wallet"><span class="nav-icon">▣</span><span>Wallet</span></a>
          <a href="#kyc"><span class="nav-icon">◇</span><span>KYC</span></a>
          <a href="#settings"><span class="nav-icon">⚙</span><span>Account Settings</span></a>
          <div class="rail-divider"></div>
          <a href="#support"><span class="nav-icon">◉</span><span>Support</span></a>
          <a href="#notifications"><span class="nav-icon">♧</span><span>Notifications</span><?php if ($unreadCount): ?><b class="count-pill"><?= h($unreadCount) ?></b><?php endif; ?></a>
        </nav>
      </div>
      <div class="rail-promo"><div class="promo-art">↗</div><strong>Build your<br>financial freedom</strong><span>Trade · Stake · Earn</span></div>
    </aside>
    <main class="portal-main" id="dashboard">
      <div class="portal-page">
        <section class="market-hero">
          <div class="hero-copy"><div class="eyebrow">› &nbsp;WELCOME BACK</div><h1>Welcome back, <?= h($displayName) ?>.</h1><p>Your balances below are read from the authoritative wallet and ledger. No demo values are substituted.</p><span class="market-status"><i></i> Live account data · <?= count($balances) ?> wallet asset<?= count($balances) === 1 ? '' : 's' ?></span></div>
          <div class="hero-callout"><span class="callout-icon">⚡</span><span><strong>Workspace connected</strong><small>Your account data is being read from MySQL.</small></span></div>
        </section>
        <section class="quick-actions" aria-label="Customer features">
          <a class="quick-feature trade" href="#opportunities"><span class="quick-icon">ϟ</span><span><strong>Trade &amp; Earn <b>PRO</b></strong><small>Opportunity features are being migrated</small></span></a>
          <a class="quick-feature stake" href="#stake"><span class="quick-icon">▤</span><span><strong>Stake &amp; Earn <b>PRO</b></strong><small>Stake features are being migrated</small></span></a>
          <a href="#wallet" class="quick-tile"><span class="tile-icon">▣</span><strong>Wallet</strong></a>
          <a href="#kyc" class="quick-tile"><span class="tile-icon">◇</span><strong>KYC</strong></a>
          <a href="#support" class="quick-tile"><span class="tile-icon">◉</span><strong>Support</strong></a>
        </section>
        <section class="workspace-card" id="wallet">
          <div class="section-kicker">TREASURY OPERATIONS</div><div class="workspace-heading"><h2><i></i> PRIMARY WORKSPACE</h2><span><i></i> Primary Workspace</span></div>
          <div class="balance-head"><div><strong>Wallet balances</strong><small>Available and locked amounts are shown separately by asset.</small></div><span class="soft-pill"><?= h($user['packageName']) ?> account</span></div>
          <?php if (!$balances): ?>
            <div class="empty-state"><strong>No wallet balances yet</strong><span>Your account has no balance rows. When wallet activity is recorded, asset balances will appear here.</span></div>
          <?php else: ?>
            <div class="balance-grid">
              <?php foreach ($balances as $balance): ?>
                <article class="balance-card"><span class="coin-icon"><?= h(substr((string)$balance['currency'], 0, 1)) ?></span><span class="balance-info"><strong><?= h($balance['currencyName']) ?></strong><small><?= h($balance['currency']) ?> · Available</small></span><b><?= h(amount_label($balance['availableMinor'], (int)$balance['currencyScale'], (string)$balance['currencySymbol'])) ?></b><small class="balance-locked">Locked: <?= h(amount_label($balance['lockedMinor'], (int)$balance['currencyScale'], (string)$balance['currencySymbol'])) ?></small></article>
              <?php endforeach; ?>
            </div>
          <?php endif; ?>
          <div class="migration-notice"><span>✓</span><span><strong>Ledger-backed display</strong><small>This PHP phase is read-only for wallet balances. It does not create trades, withdrawals, or estimated earnings.</small></span></div>
        </section>
        <section class="ledger-card" id="ledger">
          <div class="ledger-heading"><div><div class="section-kicker">ACCOUNT ACTIVITY</div><h2>Recent ledger entries</h2><p>Recent postings from the database ledger.</p></div><span class="soft-pill"><?= count($ledger) ?> shown</span></div>
          <?php if (!$ledger): ?>
            <div class="empty-state"><strong>No ledger entries</strong><span>Entries will appear here when they are posted by the application.</span></div>
          <?php else: ?>
            <div class="table-scroll"><table><thead><tr><th>Entry</th><th>Reference</th><th>Asset</th><th>Amount</th><th>Date</th></tr></thead><tbody>
              <?php foreach ($ledger as $entry): ?><tr><td><?= h(ucwords(str_replace('_', ' ', (string)$entry['entryType']))) ?></td><td><?= h($entry['reference']) ?></td><td><?= h($entry['currency']) ?></td><td><?= h(amount_label($entry['amountMinor'], (int)$entry['currencyScale'], (string)$entry['currencySymbol'])) ?></td><td><?= h($entry['createdAt']) ?></td></tr><?php endforeach; ?>
            </tbody></table></div>
          <?php endif; ?>
        </section>
        <footer class="page-footer">Arbitrade · Customer workspace · <?= h(date('Y')) ?></footer>
      </div>
    </main>
  </div>
</body>
</html>
