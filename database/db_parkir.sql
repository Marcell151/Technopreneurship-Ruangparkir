-- ============================================================================
-- DATABASE: db_parkir — RuangParkir ("Berbagi Ruang, Parkir Lebih Tenang.")
-- Sistem Web Responsif (PWA) Marketplace Parkir Komunitas — Final UAS SSI4143
-- Skema Relasional Normalisasi 3NF (9 Tabel) — MySQL / MariaDB (InnoDB, utf8mb4)
-- ============================================================================

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS `db_parkir`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `db_parkir`;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `payment_orders`;
DROP TABLE IF EXISTS `withdrawals`;
DROP TABLE IF EXISTS `bookmarks`;
DROP TABLE IF EXISTS `wallet_transactions`;
DROP TABLE IF EXISTS `reviews`;
DROP TABLE IF EXISTS `bookings`;
DROP TABLE IF EXISTS `ruangpass_subscriptions`;
DROP TABLE IF EXISTS `umkm_merchants`;
DROP TABLE IF EXISTS `parking_spots`;
DROP TABLE IF EXISTS `users`;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. TABEL PENGGUNA (3 Peran RBAC: DRIVER, LANDOWNER, ATTENDANT)
CREATE TABLE `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `role` ENUM('DRIVER','LANDOWNER','ATTENDANT') NOT NULL DEFAULT 'DRIVER',
  `name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(25) NOT NULL,
  `email` VARCHAR(120) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `avatar_text` VARCHAR(5) NOT NULL DEFAULT 'RP',
  `subtitle` VARCHAR(160) DEFAULT NULL,
  `default_plate` VARCHAR(20) DEFAULT NULL,
  `bank_info` VARCHAR(120) DEFAULT NULL,
  `wallet_balance` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_phone` (`phone`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. TABEL LAHAN / GARASI WARGA
CREATE TABLE `parking_spots` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `landowner_id` INT UNSIGNED NOT NULL,
  `attendant_id` INT UNSIGNED DEFAULT NULL,
  `name` VARCHAR(150) NOT NULL,
  `short_name` VARCHAR(60) NOT NULL,
  `category` ENUM('Mobil','Motor','Campuran') NOT NULL DEFAULT 'Mobil',
  `address` TEXT NOT NULL,
  `access_note` TEXT DEFAULT NULL,
  `distance_m` INT NOT NULL DEFAULT 200,
  `slots_car` INT NOT NULL DEFAULT 4,
  `slots_bike` INT NOT NULL DEFAULT 8,
  `occupied_car` INT NOT NULL DEFAULT 0,
  `occupied_bike` INT NOT NULL DEFAULT 0,
  `price_motor` INT NOT NULL DEFAULT 3000,
  `price_mobil` INT NOT NULL DEFAULT 8000,
  `jukir_label` VARCHAR(100) NOT NULL,
  `jukir_phone` VARCHAR(25) NOT NULL,
  `facilities_json` TEXT NOT NULL,
  `photo_url` VARCHAR(255) NOT NULL,
  `map_top` VARCHAR(10) NOT NULL DEFAULT '35%',
  `map_left` VARCHAR(10) NOT NULL DEFAULT '18%',
  `latitude` DECIMAL(10,7) NOT NULL DEFAULT -7.9428000,
  `longitude` DECIMAL(10,7) NOT NULL DEFAULT 112.6163000,
  `rating_avg` DECIMAL(3,2) NOT NULL DEFAULT 4.90,
  `reviews_count` INT NOT NULL DEFAULT 0,
  `is_open` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_spots_landowner` (`landowner_id`),
  KEY `idx_spots_attendant` (`attendant_id`),
  CONSTRAINT `fk_spots_landowner` FOREIGN KEY (`landowner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_spots_attendant` FOREIGN KEY (`attendant_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. TABEL PROMOSI UMKM SEKITAR (FEATURED MERCHANT — Rp100.000/BLN)
CREATE TABLE `umkm_merchants` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `spot_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `category` VARCHAR(60) NOT NULL,
  `distance_label` VARCHAR(80) NOT NULL,
  `promo_title` VARCHAR(120) NOT NULL,
  `promo_desc` TEXT NOT NULL,
  `promo_code` VARCHAR(30) NOT NULL,
  `open_hours` VARCHAR(50) NOT NULL,
  `monthly_fee` INT NOT NULL DEFAULT 100000,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_umkm_spot` (`spot_id`),
  CONSTRAINT `fk_umkm_spot` FOREIGN KEY (`spot_id`) REFERENCES `parking_spots`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. TABEL LANGGANAN RUANGPASS (Rp55.000 / 20x PARKIR MOTOR)
CREATE TABLE `ruangpass_subscriptions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `price_paid` INT NOT NULL DEFAULT 55000,
  `total_quota` INT NOT NULL DEFAULT 20,
  `remaining_quota` INT NOT NULL DEFAULT 20,
  `landowner_pool` INT NOT NULL DEFAULT 20000,
  `jukir_pool` INT NOT NULL DEFAULT 20000,
  `platform_margin` INT NOT NULL DEFAULT 15000,
  `payment_method` ENUM('SALDO','QRIS') NOT NULL DEFAULT 'SALDO',
  `status` ENUM('ACTIVE','EXPIRED','DEPLETED') NOT NULL DEFAULT 'ACTIVE',
  `starts_at` DATETIME NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rp_user_status` (`user_id`, `status`),
  CONSTRAINT `fk_rp_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. TABEL BOOKING & TRANSAKSI PARKIR (ARGOMETER SERVER-SIDE & SPLIT 40:40:20 + FEE Rp1.000)
CREATE TABLE `bookings` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `booking_code` VARCHAR(20) NOT NULL,
  `driver_id` INT UNSIGNED NOT NULL,
  `spot_id` INT UNSIGNED NOT NULL,
  `attendant_id` INT UNSIGNED DEFAULT NULL,
  `vehicle_type` ENUM('MOBIL','MOTOR') NOT NULL,
  `vehicle_label` VARCHAR(80) NOT NULL DEFAULT 'Kendaraan Tamu',
  `plate_number` VARCHAR(25) NOT NULL,
  `slot_label` VARCHAR(25) NOT NULL,
  `planned_duration_hours` INT NOT NULL DEFAULT 3,
  `payment_method` ENUM('SALDO','QRIS','RUANGPASS') NOT NULL DEFAULT 'SALDO',
  `promo_code` VARCHAR(30) DEFAULT NULL,
  `used_ruangpass` TINYINT(1) NOT NULL DEFAULT 0,
  `ruangpass_id` INT UNSIGNED DEFAULT NULL,
  `base_parking_tariff` INT NOT NULL DEFAULT 8000,
  `platform_fee` INT NOT NULL DEFAULT 1000,
  `overstay_hours` INT NOT NULL DEFAULT 0,
  `overstay_fee` INT NOT NULL DEFAULT 0,
  `total_user_paid` INT NOT NULL DEFAULT 9000,
  `share_landowner` INT NOT NULL DEFAULT 0,
  `share_jukir` INT NOT NULL DEFAULT 0,
  `share_platform` INT NOT NULL DEFAULT 0,
  `status` ENUM('WAITING_CHECKIN','ACTIVE','FINISHED','CANCELLED') NOT NULL DEFAULT 'WAITING_CHECKIN',
  `checked_in_at` DATETIME DEFAULT NULL,
  `checked_out_at` DATETIME DEFAULT NULL,
  `actual_duration_label` VARCHAR(50) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bookings_code` (`booking_code`),
  KEY `idx_bookings_driver` (`driver_id`),
  KEY `idx_bookings_spot_status` (`spot_id`, `status`),
  CONSTRAINT `fk_bookings_driver` FOREIGN KEY (`driver_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bookings_spot` FOREIGN KEY (`spot_id`) REFERENCES `parking_spots`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bookings_attendant` FOREIGN KEY (`attendant_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_bookings_rp` FOREIGN KEY (`ruangpass_id`) REFERENCES `ruangpass_subscriptions`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. TABEL ULASAN & QUALITY CONTROL (BINTANG 1–5; qc_flag=1 BILA RATING < 3)
CREATE TABLE `reviews` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `booking_id` INT UNSIGNED NOT NULL,
  `spot_id` INT UNSIGNED NOT NULL,
  `driver_id` INT UNSIGNED NOT NULL,
  `rating` TINYINT UNSIGNED NOT NULL,
  `feedback_tags` VARCHAR(255) DEFAULT NULL,
  `comment` TEXT DEFAULT NULL,
  `qc_flag` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reviews_booking` (`booking_id`),
  KEY `idx_reviews_spot` (`spot_id`),
  CONSTRAINT `fk_reviews_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reviews_spot` FOREIGN KEY (`spot_id`) REFERENCES `parking_spots`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reviews_driver` FOREIGN KEY (`driver_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. TABEL LOG KEUANGAN / DOMPET (AUDIT TRAIL TRANSAKSI & BAGI HASIL)
CREATE TABLE `wallet_transactions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `booking_id` INT UNSIGNED DEFAULT NULL,
  `tx_type` ENUM('TOPUP','BOOKING_PAY','OVERSTAY_PAY','RUANGPASS_BUY','REVENUE_SHARE','WITHDRAW') NOT NULL,
  `amount` INT NOT NULL,
  `balance_after` INT NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wtx_user` (`user_id`, `created_at`),
  CONSTRAINT `fk_wtx_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wtx_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. TABEL FAVORIT / BOOKMARK GARASI
CREATE TABLE `bookmarks` (
  `user_id` INT UNSIGNED NOT NULL,
  `spot_id` INT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `spot_id`),
  CONSTRAINT `fk_bm_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bm_spot` FOREIGN KEY (`spot_id`) REFERENCES `parking_spots`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. TABEL PENCAIRAN DANA MITRA PEMILIK LAHAN (SOP BAB 12.5: MIN. Rp50.000)
CREATE TABLE `withdrawals` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `amount` INT NOT NULL,
  `bank_account` VARCHAR(120) NOT NULL,
  `status` ENUM('PROCESSED','PENDING') NOT NULL DEFAULT 'PROCESSED',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wd_user` (`user_id`),
  CONSTRAINT `fk_wd_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. TABEL TRANSAKSI PAYMENT GATEWAY MIDTRANS SNAP (BOOKING, TOPUP, RUANGPASS)
CREATE TABLE `payment_orders` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` VARCHAR(60) NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `purpose` ENUM('BOOKING','TOPUP','RUANGPASS') NOT NULL,
  `amount` INT NOT NULL,
  `snap_token` VARCHAR(120) DEFAULT NULL,
  `redirect_url` VARCHAR(255) DEFAULT NULL,
  `payload_json` TEXT DEFAULT NULL,
  `midtrans_status` VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  `payment_type` VARCHAR(40) DEFAULT NULL,
  `booking_id` INT UNSIGNED DEFAULT NULL,
  `settled_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_po_order_id` (`order_id`),
  KEY `idx_po_user` (`user_id`, `created_at`),
  CONSTRAINT `fk_po_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_po_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- SEED DATA AWAL REALISTIS (PIN DEFAULT SEMUA AKUN DEMO: 123456)
-- ============================================================================

INSERT INTO `users` (`id`, `role`, `name`, `phone`, `email`, `password_hash`, `avatar_text`, `subtitle`, `default_plate`, `bank_info`, `wallet_balance`) VALUES
(1, 'DRIVER',    'Budi Santoso (Driver)',       '081298765432', 'budi.santoso@gmail.com',  '$2y$10$9U2VCOMoL0a8SZE5.P6JpeVCfQsieZbBxCf.GcmLnlL.YRmkx51N2', 'BS', 'Pengemudi Mobil & Motor (Plat N 1234 ABC)',         'N 1234 ABC', NULL,                                        75000),
(2, 'LANDOWNER', 'Pak Budi (Garasi Wijaya)',    '081122334455', 'garasi.wijaya@gmail.com', '$2y$10$9U2VCOMoL0a8SZE5.P6JpeVCfQsieZbBxCf.GcmLnlL.YRmkx51N2', 'BW', 'Mitra Pemilik Lahan (Garasi Soehat No. 45)',        NULL,         'BCA 8820-192-331 (Pak Budi — Garasi Wijaya)', 340000),
(3, 'ATTENDANT', 'Pak Slamet Riyadi',           '087899887766', 'slamet.pos01@gmail.com',  '$2y$10$9U2VCOMoL0a8SZE5.P6JpeVCfQsieZbBxCf.GcmLnlL.YRmkx51N2', 'SR', 'Petugas Jukir Lapangan (Pos 01 Soekarno Hatta)',    NULL,         'Dana / BRI 0878-9988-7766 (Slamet Riyadi)',  48000),
(4, 'DRIVER',    'Andi Pratama (Tamu)',         '085711223344', 'andi.tamu@gmail.com',     '$2y$10$9U2VCOMoL0a8SZE5.P6JpeVCfQsieZbBxCf.GcmLnlL.YRmkx51N2', 'AP', 'Pengemudi Harian Area Suhat',                       'B 4410 KLA', NULL,                                        50000);

INSERT INTO `parking_spots` (`id`, `landowner_id`, `attendant_id`, `name`, `short_name`, `category`, `address`, `access_note`, `distance_m`, `slots_car`, `slots_bike`, `occupied_car`, `occupied_bike`, `price_motor`, `price_mobil`, `jukir_label`, `jukir_phone`, `facilities_json`, `photo_url`, `map_top`, `map_left`, `latitude`, `longitude`, `rating_avg`, `reviews_count`, `is_open`) VALUES
(1, 2, 3, 'Garasi Pak Budi - Soekarno Hatta No. 45', 'Garasi Pak Budi', 'Mobil',
 'Jl. Soekarno Hatta No. 45, Lowokwaru, Malang',
 'Masuk 30m dari Jl. Soekarno Hatta sebelah minimarket, pagar hijau berplang resmi RuangParkir.',
 200, 4, 8, 1, 1, 3000, 8000, 'Slamet Riyadi (ID: JK-04)', '0878-9988-7766',
 '["CCTV 24 Jam","Kanopi Beratap","Akses Jalan Lebar","Dijaga Jukir"]',
 'https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=600&auto=format&fit=crop&q=80',
 '35%', '18%', -7.9428000, 112.6163000, 4.90, 128, 1),

(2, 2, 3, 'Garasi Bu Rina - Borobudur Barat No. 15', 'Garasi Bu Rina', 'Mobil',
 'Jl. Candi Borobudur Barat No. 15, Blimbing, Malang',
 'Masuk Jl. Candi Borobudur Barat, rumah kanopi abu-abu 40m dari jalan utama.',
 450, 3, 6, 2, 2, 3000, 8000, 'Agus Santoso (ID: JK-09)', '0813-4455-6677',
 '["Dijaga Jukir","Akses 24 Jam","Lantai Paving"]',
 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=600&auto=format&fit=crop&q=80',
 '56%', '52%', -7.9378000, 112.6258000, 4.80, 42, 1),

(3, 2, 3, 'Lahan Parkir Warga Merbabu No. 8', 'Lahan Merbabu', 'Motor',
 'Jl. Merbabu No. 8, Klojen, Malang',
 'Halaman samping Jl. Merbabu No. 8 dekat pusat kuliner, khusus kendaraan roda dua.',
 650, 0, 10, 0, 4, 3000, 8000, 'Bambang Irawan (ID: JK-12)', '0856-7788-9900',
 '["Khusus Roda Dua","Penerangan Terang","Dekat Pusat Kuliner"]',
 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=600&auto=format&fit=crop&q=80',
 '28%', '48%', -7.9702000, 112.6224000, 4.70, 31, 1);

INSERT INTO `umkm_merchants` (`id`, `spot_id`, `name`, `category`, `distance_label`, `promo_title`, `promo_desc`, `promo_code`, `open_hours`, `monthly_fee`, `is_active`) VALUES
(1, 1, 'Kedai Kopi Suhat 45', 'Kopi & Camilan', '50m dari Garasi Pak Budi',
 'Diskon 15% Semua Kopi Susu',
 'Tunjukkan E-Tiket aktif RuangParkir di kasir untuk menikmati potongan 15% seluruh menu kopi & snack.',
 'RP-KOPI15', '08.00 – 23.00 WIB', 100000, 1),

(2, 2, 'Warung Lalapan & Bakso Cak Mat', 'Kuliner Malang', '80m dari Garasi Bu Rina',
 'Gratis Es Teh Manis',
 'Gratis 1 Es Teh Manis untuk setiap pembelian paket lalapan atau bakso dengan menunjukkan E-Tiket RuangParkir.',
 'RP-CAKMAT', '10.00 – 22.00 WIB', 100000, 1),

(3, 3, 'Roti Bakar Senja Klojen', 'Kafe & Hangout', '60m dari Lahan Merbabu',
 'Potongan Rp5.000 (Min. Rp30rb)',
 'Berlaku khusus pengunjung parkir motor RuangParkir di Lahan Merbabu No. 8.',
 'RP-SENJA5K', '15.00 – 23.00 WIB', 100000, 1);

-- Kendaraan aktif di Garasi Pak Budi + riwayat selesai Driver (sesuai Tabel 10.1)
INSERT INTO `bookings` (`booking_code`, `driver_id`, `spot_id`, `attendant_id`, `vehicle_type`, `vehicle_label`, `plate_number`, `slot_label`, `planned_duration_hours`, `payment_method`, `promo_code`, `used_ruangpass`, `base_parking_tariff`, `platform_fee`, `overstay_hours`, `overstay_fee`, `total_user_paid`, `share_landowner`, `share_jukir`, `share_platform`, `status`, `checked_in_at`, `checked_out_at`, `actual_duration_label`) VALUES
('RP-81001', 4, 1, 3, 'MOBIL', 'Honda HR-V Putih', 'B 4410 KLA', 'Slot A-01', 3, 'SALDO', NULL, 0, 8000, 1000, 0, 0, 9000, 0, 0, 0, 'ACTIVE', DATE_SUB(NOW(), INTERVAL 105 MINUTE), NULL, NULL),
('RP-81002', 4, 1, 3, 'MOTOR', 'Vario 160 Merah',  'N 8892 XY',  'Slot M-01', 3, 'QRIS',  NULL, 0, 3000, 1000, 0, 0, 4000, 0, 0, 0, 'ACTIVE', DATE_SUB(NOW(), INTERVAL 30 MINUTE),  NULL, NULL),
('RP-77102', 1, 2, 3, 'MOBIL', 'Mobil Pribadi',    'N 1234 ABC', 'Slot A-02', 2, 'SALDO', NULL, 0, 8000, 1000, 0, 0, 9000, 3200, 3200, 2600, 'FINISHED', DATE_SUB(NOW(), INTERVAL 26 HOUR), DATE_SUB(NOW(), INTERVAL 24 HOUR), '2 Jam (Flat)'),
('RP-65901', 1, 1, 3, 'MOTOR', 'Motor Pribadi',    'N 8892 XY',  'Slot M-02', 5, 'SALDO', NULL, 0, 3000, 1000, 2, 2000, 6000, 2000, 2000, 2000, 'FINISHED', DATE_SUB(NOW(), INTERVAL 53 HOUR), DATE_SUB(NOW(), INTERVAL 48 HOUR), '5 Jam (+2 Jam)');

INSERT INTO `bookmarks` (`user_id`, `spot_id`) VALUES (1, 1);

INSERT INTO `wallet_transactions` (`user_id`, `booking_id`, `tx_type`, `amount`, `balance_after`, `description`) VALUES
(1, NULL, 'TOPUP',         90000,  90000,  'Top Up Saldo RuangPay Awal'),
(1, 3,    'BOOKING_PAY',   -9000,  81000,  'Pembayaran Parkir #RP-77102 (Mobil Flat 3 Jam + Fee Rp1.000)'),
(1, 4,    'BOOKING_PAY',   -6000,  75000,  'Pembayaran Parkir #RP-65901 (Motor 5 Jam + Fee Rp1.000)'),
(2, 3,    'REVENUE_SHARE',  3200, 338000,  'Bagi Hasil Pemilik 40% Transaksi #RP-77102'),
(2, 4,    'REVENUE_SHARE',  2000, 340000,  'Bagi Hasil Pemilik 40% Transaksi #RP-65901'),
(3, 3,    'REVENUE_SHARE',  3200,  46000,  'Upah Bagi Hasil Jukir 40% Transaksi #RP-77102'),
(3, 4,    'REVENUE_SHARE',  2000,  48000,  'Upah Bagi Hasil Jukir 40% Transaksi #RP-65901');
