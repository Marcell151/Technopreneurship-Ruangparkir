<?php
/**
 * API Dompet RuangPay (Top Up), Pencairan Saldo Pemilik Lahan (Min. Rp50.000), & Pembelian RuangPass (Rp55.000/20x Motor)
 */
declare(strict_types=1);
require_once __DIR__ . '/../config/database.php';

$pdo = getDB();
$action = $_GET['action'] ?? 'logs';

try {
    $user = requireAuthUser($pdo);

    if ($action === 'topup') {
        if ($user['role'] !== 'DRIVER') {
            jsonResponse(['ok' => false, 'message' => 'Top Up RuangPay hanya tersedia untuk akun Pengemudi.'], 403);
        }
        $data = getJsonBody();
        $amount = (int)($data['amount'] ?? 0);
        if ($amount < 10000 || $amount > 5000000) {
            jsonResponse(['ok' => false, 'message' => 'Nominal Top Up harus antara Rp10.000 hingga Rp5.000.000.'], 422);
        }

        $pdo->beginTransaction();
        $uStmt = $pdo->prepare('SELECT wallet_balance FROM users WHERE id = ? FOR UPDATE');
        $uStmt->execute([$user['id']]);
        $newBal = (int)$uStmt->fetchColumn() + $amount;
        $pdo->prepare('UPDATE users SET wallet_balance = ? WHERE id = ?')->execute([$newBal, $user['id']]);
        logWalletTx($pdo, $user['id'], null, 'TOPUP', $amount, $newBal, 'Top Up Saldo RuangPay');
        $pdo->commit();

        jsonResponse([
            'ok'             => true,
            'wallet_balance' => $newBal,
            'message'        => 'Top Up Rp ' . number_format($amount, 0, ',', '.') . ' berhasil masuk ke saldo RuangPay!',
        ]);
    }

    if ($action === 'withdraw') {
        if ($user['role'] !== 'LANDOWNER') {
            jsonResponse(['ok' => false, 'message' => 'Pencairan saldo mitra hanya tersedia untuk Pemilik Lahan.'], 403);
        }
        $data = getJsonBody();
        $amount = (int)($data['amount'] ?? 0);
        if ($amount < RP_MIN_WITHDRAW) {
            jsonResponse(['ok' => false, 'message' => 'Minimal pencairan saldo mitra sesuai SOP adalah Rp 50.000.'], 422);
        }

        $pdo->beginTransaction();
        $uStmt = $pdo->prepare('SELECT wallet_balance, bank_info, name FROM users WHERE id = ? FOR UPDATE');
        $uStmt->execute([$user['id']]);
        $u = $uStmt->fetch();
        $bal = (int)$u['wallet_balance'];
        if ($bal < $amount) {
            $pdo->rollBack();
            jsonResponse(['ok' => false, 'message' => 'Saldo tertampung tidak mencukupi.'], 402);
        }

        $newBal = $bal - $amount;
        $bank = $u['bank_info'] ?: ('BCA 8820-192-331 (' . $u['name'] . ')');
        $pdo->prepare('UPDATE users SET wallet_balance = ? WHERE id = ?')->execute([$newBal, $user['id']]);
        $pdo->prepare("INSERT INTO withdrawals (user_id, amount, bank_account, status) VALUES (?, ?, ?, 'PROCESSED')")
            ->execute([$user['id'], $amount, $bank]);
        logWalletTx($pdo, $user['id'], null, 'WITHDRAW', -$amount, $newBal, 'Pencairan Saldo Mitra ke ' . $bank);
        $pdo->commit();

        jsonResponse([
            'ok'             => true,
            'wallet_balance' => $newBal,
            'message'        => 'Pencairan Rp ' . number_format($amount, 0, ',', '.') . ' ke ' . $bank . ' berhasil diproses!',
        ]);
    }

    if ($action === 'buy_ruangpass') {
        if ($user['role'] !== 'DRIVER') {
            jsonResponse(['ok' => false, 'message' => 'Paket RuangPass khusus untuk akun Pengemudi.'], 403);
        }
        $data = getJsonBody();
        $method = strtoupper(trim((string)($data['payment_method'] ?? 'SALDO')));
        if (!in_array($method, ['SALDO', 'QRIS'], true)) {
            $method = 'SALDO';
        }

        $pdo->beginTransaction();
        $uStmt = $pdo->prepare('SELECT wallet_balance FROM users WHERE id = ? FOR UPDATE');
        $uStmt->execute([$user['id']]);
        $bal = (int)$uStmt->fetchColumn();

        if ($method === 'SALDO') {
            if ($bal < RP_RUANGPASS_PRICE) {
                $pdo->rollBack();
                jsonResponse([
                    'ok'      => false,
                    'code'    => 'INSUFFICIENT_BALANCE',
                    'message' => 'Saldo RuangPay kurang untuk RuangPass (Rp 55.000). Silakan Top Up terlebih dahulu.',
                ], 402);
            }
            $bal -= RP_RUANGPASS_PRICE;
            $pdo->prepare('UPDATE users SET wallet_balance = ? WHERE id = ?')->execute([$bal, $user['id']]);
            logWalletTx($pdo, $user['id'], null, 'RUANGPASS_BUY', -RP_RUANGPASS_PRICE, $bal, 'Pembelian Paket Langganan RuangPass (20x Parkir Motor)');
        }

        // Check existing active RuangPass to top up quota or insert new
        $rpStmt = $pdo->prepare(
            "SELECT * FROM ruangpass_subscriptions WHERE user_id = ? AND status = 'ACTIVE' AND expires_at >= NOW() ORDER BY id DESC LIMIT 1 FOR UPDATE"
        );
        $rpStmt->execute([$user['id']]);
        $existing = $rpStmt->fetch();

        if ($existing) {
            $newRem = (int)$existing['remaining_quota'] + RP_RUANGPASS_QUOTA;
            $newTot = (int)$existing['total_quota'] + RP_RUANGPASS_QUOTA;
            $newExp = date('Y-m-d H:i:s', strtotime('+30 days'));
            $pdo->prepare('UPDATE ruangpass_subscriptions SET remaining_quota = ?, total_quota = ?, expires_at = ? WHERE id = ?')
                ->execute([$newRem, $newTot, $newExp, $existing['id']]);
        } else {
            $starts = date('Y-m-d H:i:s');
            $expires = date('Y-m-d H:i:s', strtotime('+30 days'));
            $pdo->prepare(
                'INSERT INTO ruangpass_subscriptions
                 (user_id, price_paid, total_quota, remaining_quota, landowner_pool, jukir_pool, platform_margin, payment_method, status, starts_at, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, "ACTIVE", ?, ?)'
            )->execute([
                $user['id'], RP_RUANGPASS_PRICE, RP_RUANGPASS_QUOTA, RP_RUANGPASS_QUOTA,
                RP_RUANGPASS_OWNER_POOL, RP_RUANGPASS_JUKIR_POOL, RP_RUANGPASS_PLATFORM,
                $method, $starts, $expires,
            ]);
            $newRem = RP_RUANGPASS_QUOTA;
            $newTot = RP_RUANGPASS_QUOTA;
            $newExp = $expires;
        }

        $pdo->commit();

        jsonResponse([
            'ok'             => true,
            'wallet_balance' => $bal,
            'ruangPass'      => [
                'active'         => true,
                'remainingQuota' => $newRem,
                'totalQuota'     => $newTot,
                'validUntil'     => date('d M Y', strtotime($newExp)),
            ],
            'message'        => 'RuangPass aktif! ' . $newRem . ' kuota parkir motor siap digunakan.',
        ]);
    }

    // Default: logs
    $stmt = $pdo->prepare('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 20');
    $stmt->execute([$user['id']]);
    jsonResponse(['ok' => true, 'logs' => $stmt->fetchAll()]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    jsonResponse(['ok' => false, 'message' => 'Kesalahan server: ' . $e->getMessage()], 500);
}
