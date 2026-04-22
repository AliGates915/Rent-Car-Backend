-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Apr 22, 2026 at 11:17 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.0.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `defaultdb`
--

-- --------------------------------------------------------

--
-- Table structure for table `bookings`
--
CREATE TABLE IF NOT EXISTS `bookings` (
  `id` int(11) NOT NULL,
  `booking_code` varchar(50) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `rent_type_id` int(11) DEFAULT NULL,
  `date_from` date NOT NULL,
  `date_to` date NOT NULL,
  `pickup_city` varchar(100) DEFAULT NULL,
  `dropoff_city` varchar(100) DEFAULT NULL,
  `rate_per_day` decimal(10,2) NOT NULL,
  `total_days` int(11) NOT NULL,
  `total_amount` decimal(12,2) NOT NULL,
  `advance_amount` decimal(12,2) DEFAULT 0.00,
  `paid_amount` decimal(12,2) DEFAULT 0.00,
  `security_deposit` decimal(12,2) DEFAULT 0.00,
  `status` enum('pending','confirmed','ongoing','completed','cancelled') DEFAULT 'pending',
  `payment_status` enum('unpaid','partial','paid') DEFAULT 'unpaid',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `bookings`
--

-- INSERT INTO `bookings` (`id`, `booking_code`, `customer_id`, `vehicle_id`, `rent_type_id`, `date_from`, `date_to`, `pickup_city`, `dropoff_city`, `rate_per_day`, `total_days`, `total_amount`, `advance_amount`, `paid_amount`, `security_deposit`, `status`, `payment_status`, `created_at`, `updated_at`) VALUES
-- (9, 'BK-1776846019200', 1, 2, 1, '2026-04-22', '2026-04-23', 'Lahore', 'Okara', 3000.00, 2, 6000.00, 2000.00, 4000.00, 1000.00, 'ongoing', 'partial', '2026-04-22 08:20:19', '2026-04-22 08:38:11');

-- --------------------------------------------------------

--
-- Table structure for table `booking_payments`
--

CREATE TABLE IF NOT EXISTS `booking_payments` (
  `id` int(11) NOT NULL,
  `booking_id` int(11) NOT NULL,
  `payment_type` enum('advance','payment','security_deposit') NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `payment_method` varchar(50) DEFAULT 'cash',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `booking_payments`
--

-- INSERT INTO `booking_payments` (`id`, `booking_id`, `payment_type`, `amount`, `payment_method`, `notes`, `created_at`) VALUES
-- (21, 9, 'advance', 2000.00, 'cash', 'Advance payment for rental', '2026-04-22 08:20:19'),
-- (22, 9, 'security_deposit', 1000.00, 'cash', 'Security deposit collected', '2026-04-22 08:20:19'),
-- (23, 9, 'payment', 2000.00, 'cash', 'Payment towards booking - ', '2026-04-22 08:38:11');

-- --------------------------------------------------------

--
-- Table structure for table `booking_status_logs`
--

CREATE TABLE IF NOT EXISTS `booking_status_logs` (
  `id` int(11) NOT NULL,
  `booking_id` int(11) NOT NULL,
  `from_status` varchar(20) DEFAULT NULL,
  `to_status` varchar(20) DEFAULT NULL,
  `changed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `changed_by` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cash_receipts`
--

CREATE TABLE IF NOT EXISTS `cash_receipts` (
  `id` int(11) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `source` varchar(50) DEFAULT NULL,
  `reference_id` int(11) DEFAULT NULL,
  `payment_method` varchar(50) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `cash_receipts`
--

-- INSERT INTO `cash_receipts` (`id`, `amount`, `source`, `reference_id`, `payment_method`, `notes`, `customer_id`, `created_at`) VALUES
-- (3, 2000.00, 'booking', 9, 'cash', '', 1, '2026-04-22 08:38:11');

-- --------------------------------------------------------

--
-- Table structure for table `customers`
--

CREATE TABLE IF NOT EXISTS `customers` (
  `id` int(11) NOT NULL,
  `customer_name` varchar(100) NOT NULL,
  `father_name` varchar(100) DEFAULT NULL,
  `cnic_no` varchar(20) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `phone_no` varchar(20) NOT NULL,
  `alternate_phone` varchar(20) DEFAULT NULL,
  `driving_license_no` varchar(50) DEFAULT NULL,
  `profession` varchar(100) DEFAULT NULL,
  `profession_address` text DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `balance` decimal(12,2) DEFAULT 0.00,
  `status` enum('active','inactive','blocked') DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `customers`
--

-- INSERT INTO `customers` (`id`, `customer_name`, `father_name`, `cnic_no`, `address`, `phone_no`, `alternate_phone`, `driving_license_no`, `profession`, `profession_address`, `notes`, `balance`, `status`, `created_at`, `updated_at`) VALUES
-- (1, 'A', NULL, '344557777', '53/2.L', '0344775555', NULL, NULL, 'Other', NULL, NULL, 2000.00, 'active', '2026-04-17 06:50:13', '2026-04-22 08:38:11');

-- --------------------------------------------------------

--
-- Table structure for table `customer_references`
--

CREATE TABLE IF NOT EXISTS `customer_references` (
  `id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `reference_name` varchar(100) NOT NULL,
  `reference_father` varchar(100) DEFAULT NULL,
  `reference_phone_no` varchar(20) DEFAULT NULL,
  `reference_cnic` varchar(20) DEFAULT NULL,
  `reference_address` text DEFAULT NULL,
  `relation_with_customer` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `customer_references`
--

-- INSERT INTO `customer_references` (`id`, `customer_id`, `reference_name`, `reference_father`, `reference_phone_no`, `reference_cnic`, `reference_address`, `relation_with_customer`, `created_at`) VALUES
-- (1, 1, 'Ali', 'NEw', '034444', '35422574777', 'Okara', NULL, '2026-04-17 06:51:00');

-- --------------------------------------------------------

--
-- Table structure for table `earning_payments`
--

CREATE TABLE IF NOT EXISTS `earning_payments` (
  `id` int(11) NOT NULL,
  `earning_id` int(11) NOT NULL,
  `booking_id` int(11) NOT NULL,
  `company_paid` decimal(10,2) DEFAULT 0.00,
  `owner_paid` decimal(10,2) DEFAULT 0.00,
  `payment_date` date NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `expense_vouchers`
--

CREATE TABLE IF NOT EXISTS `expense_vouchers` (
  `id` int(11) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `expense_type` varchar(100) DEFAULT NULL,
  `vendor_name` varchar(100) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ledgers`
--

CREATE TABLE IF NOT EXISTS `ledgers` (
  `id` int(11) NOT NULL,
  `entry_type` varchar(50) DEFAULT NULL,
  `reference_id` int(11) DEFAULT NULL,
  `reference_table` varchar(50) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `vehicle_id` int(11) DEFAULT NULL,
  `owner_id` int(11) DEFAULT NULL,
  `debit` decimal(12,2) DEFAULT 0.00,
  `credit` decimal(12,2) DEFAULT 0.00,
  `description` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `ledgers`
--

-- INSERT INTO `ledgers` (`id`, `entry_type`, `reference_id`, `reference_table`, `customer_id`, `vehicle_id`, `owner_id`, `debit`, `credit`, `description`, `created_at`) VALUES
-- (9, 'handover', 5, 'vehicle_handover', 1, 2, NULL, 0.00, 6000.00, 'Booking BK-1776846019200 - Vehicle handover (undefinedx multiplier applied)', '2026-04-22 08:37:04');

-- --------------------------------------------------------

--
-- Table structure for table `owner_earnings`
--

CREATE TABLE IF NOT EXISTS `owner_earnings` (
  `id` int(11) NOT NULL,
  `owner_id` int(11) NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `booking_id` int(11) NOT NULL,
  `booking_code` varchar(50) NOT NULL,
  `total_days` int(11) NOT NULL,
  `booking_amount` decimal(10,2) NOT NULL,
  `owner_percentage` decimal(5,2) NOT NULL,
  `owner_amount` decimal(10,2) NOT NULL,
  `company_amount` decimal(10,2) NOT NULL,
  `status` enum('unpaid','paid') DEFAULT 'unpaid',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `rent_types`
--

CREATE TABLE IF NOT EXISTS `rent_types` (
  `id` int(11) NOT NULL,
  `name` varchar(50) NOT NULL,
  `description` text DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `rent_types`
--

-- INSERT INTO `rent_types` (`id`, `name`, `description`, `status`, `created_at`, `updated_at`) VALUES
-- (1, 'Daily', NULL, 'active', '2026-04-17 06:15:49', '2026-04-17 06:15:49'),
-- (2, 'Weekly', NULL, 'active', '2026-04-17 06:15:49', '2026-04-17 06:15:49'),
-- (3, 'Monthly', NULL, 'active', '2026-04-17 06:15:49', '2026-04-17 06:15:49');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','staff','user') DEFAULT 'user',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

-- INSERT INTO `users` (`id`, `name`, `email`, `password`, `role`, `created_at`, `updated_at`) VALUES
-- (1, 'Ali', 'ali@gmail.com', '$2b$10$Cl/MIXmzLLd9.a/e4TxTweBI/D9ve/x77OZwYJhKz8lq0HuPMvhCy', 'admin', '2026-04-17 06:43:29', '2026-04-17 11:07:39');

-- --------------------------------------------------------

--
-- Table structure for table `vehicles`
--

CREATE TABLE IF NOT EXISTS `vehicles` (
  `id` int(11) NOT NULL,
  `owner_id` int(11) DEFAULT NULL,
  `owner_percentage` decimal(5,2) DEFAULT 0.00,
  `registration_no` varchar(50) NOT NULL,
  `car_type` varchar(50) DEFAULT NULL,
  `car_make` varchar(50) DEFAULT NULL,
  `car_model` varchar(50) DEFAULT NULL,
  `year_of_model` int(11) DEFAULT NULL,
  `rate_per_day` decimal(10,2) NOT NULL,
  `color` varchar(30) DEFAULT NULL,
  `transmission_type` enum('Manual','Automatic') DEFAULT 'Manual',
  `fuel_type` enum('Petrol','Diesel','CNG','Electric') DEFAULT 'Petrol',
  `engine_capacity` varchar(20) DEFAULT NULL,
  `seating_capacity` int(11) DEFAULT NULL,
  `location` varchar(100) DEFAULT NULL,
  `air_conditioner` tinyint(1) DEFAULT 0,
  `heater` tinyint(1) DEFAULT 0,
  `sunroof` tinyint(1) DEFAULT 0,
  `android` tinyint(1) DEFAULT 0,
  `front_camera` tinyint(1) DEFAULT 0,
  `rear_camera` tinyint(1) DEFAULT 0,
  `status` enum('available','booked','maintenance','unavailable') DEFAULT 'available',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `is_active` tinyint(1) DEFAULT 1,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `vehicles`
--

-- INSERT INTO `vehicles` (`id`, `owner_id`, `owner_percentage`, `registration_no`, `car_type`, `car_make`, `car_model`, `year_of_model`, `rate_per_day`, `color`, `transmission_type`, `fuel_type`, `engine_capacity`, `seating_capacity`, `location`, `air_conditioner`, `heater`, `sunroof`, `android`, `front_camera`, `rear_camera`, `status`, `created_at`, `updated_at`, `is_active`, `deleted_at`) VALUES
-- (1, 1, 0.00, 'LEA-321', '1', 'Honda ', 'Civic', 2026, 5000.00, 'White', 'Automatic', 'Petrol', '1800cc', 5, 'Lahore', 1, 0, 0, 1, 1, 1, 'available', '2026-04-17 11:07:48', '2026-04-17 11:16:04', 1, NULL),
-- (2, 1, 0.00, 'LEA-3434', '1', 'Suzuki', ' Alto', 2026, 3000.00, 'White', 'Manual', 'Petrol', '1400cc', 4, NULL, 1, 0, 0, 1, 0, 1, 'booked', '2026-04-17 11:10:01', '2026-04-22 08:20:19', 1, NULL);

-- -- --------------------------------------------------------

--
-- Table structure for table `vehicle_accessory_types`
--

CREATE TABLE IF NOT EXISTS `vehicle_accessory_types` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `vehicle_accessory_types`
--

-- INSERT INTO `vehicle_accessory_types` (`id`, `name`, `description`, `status`, `created_at`, `updated_at`) VALUES
-- (1, 'Child Seat', NULL, 'active', '2026-04-17 06:15:49', '2026-04-17 06:15:49'),
-- (2, 'GPS Navigation', NULL, 'active', '2026-04-17 06:15:49', '2026-04-17 06:15:49'),
-- (3, 'Roof Rack', NULL, 'active', '2026-04-17 06:15:49', '2026-04-17 06:15:49');

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_documents`
--

CREATE TABLE IF NOT EXISTS `vehicle_documents` (
  `id` int(11) NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `document_type` varchar(50) NOT NULL,
  `document_number` varchar(100) DEFAULT NULL,
  `issue_date` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `file_url` text NOT NULL,
  `public_id` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_handover`
--

CREATE TABLE IF NOT EXISTS `vehicle_handover` (
  `id` int(11) NOT NULL,
  `booking_id` int(11) NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `handed_over_by` varchar(100) DEFAULT NULL,
  `handover_date` date NOT NULL,
  `handover_time` time NOT NULL,
  `km_out` int(11) DEFAULT NULL,
  `fuel_level_out` varchar(20) DEFAULT NULL,
  `vehicle_out_notes` text DEFAULT NULL,
  `customer_signature_url` text DEFAULT NULL,
  `staff_signature_url` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `vehicle_handover`
--

-- INSERT INTO `vehicle_handover` (`id`, `booking_id`, `vehicle_id`, `handed_over_by`, `handover_date`, `handover_time`, `km_out`, `fuel_level_out`, `vehicle_out_notes`, `customer_signature_url`, `staff_signature_url`, `created_at`, `updated_at`) VALUES
-- (5, 9, 2, 'ali', '2026-04-22', '13:36:00', NULL, '', NULL, 'ali', 'admin', '2026-04-22 08:37:04', '2026-04-22 08:37:04');

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_handover_accessories`
--

CREATE TABLE IF NOT EXISTS `vehicle_handover_accessories` (
  `id` int(11) NOT NULL,
  `handover_id` int(11) NOT NULL,
  `accessory_type_id` int(11) NOT NULL,
  `is_given` tinyint(1) DEFAULT 1,
  `remarks` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `vehicle_handover_accessories`
--

-- INSERT INTO `vehicle_handover_accessories` (`id`, `handover_id`, `accessory_type_id`, `is_given`, `remarks`) VALUES
-- (5, 5, 2, 1, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_images`
--

CREATE TABLE IF NOT EXISTS `vehicle_images` (
  `id` int(11) NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `image_url` text NOT NULL,
  `public_id` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `vehicle_images`
--

-- INSERT INTO `vehicle_images` (`id`, `vehicle_id`, `image_url`, `public_id`, `created_at`) VALUES
-- (1, 1, 'https://res.cloudinary.com/dzxku7hrr/image/upload/v1776424067/rent-cars/rxostljpnua63a1w8tum.jpg', 'rent-cars/rxostljpnua63a1w8tum', '2026-04-17 11:07:48'),
-- (2, 1, 'https://res.cloudinary.com/dzxku7hrr/image/upload/v1776424067/rent-cars/xvmxhviqzyu7mmzufnzk.jpg', 'rent-cars/xvmxhviqzyu7mmzufnzk', '2026-04-17 11:07:48'),
-- (3, 2, 'https://res.cloudinary.com/dzxku7hrr/image/upload/v1776424200/rent-cars/rqmms6hjelzjwdft5fur.jpg', 'rent-cars/rqmms6hjelzjwdft5fur', '2026-04-17 11:10:01');

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_maintenance_logs`
--

CREATE TABLE IF NOT EXISTS `vehicle_maintenance_logs` (
  `id` int(11) NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `maintenance_type_id` int(11) NOT NULL,
  `service_date` date DEFAULT NULL,
  `odometer_km` int(11) DEFAULT NULL,
  `amount` decimal(12,2) DEFAULT NULL,
  `vendor_name` varchar(100) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_maintenance_types`
--

CREATE TABLE IF NOT EXISTS `vehicle_maintenance_types` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `default_km_interval` int(11) DEFAULT NULL,
  `default_days_interval` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_owners`
--

CREATE TABLE IF NOT EXISTS `vehicle_owners` (
  `id` int(11) NOT NULL,
  `owner_name` varchar(100) NOT NULL,
  `father_name` varchar(100) DEFAULT NULL,
  `cnic_no` varchar(20) DEFAULT NULL,
  `phone_no` varchar(20) NOT NULL,
  `alternate_phone` varchar(20) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `city` varchar(50) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_by` int(11) DEFAULT NULL,
  `cnic_front_url` text DEFAULT NULL,
  `cnic_back_url` text DEFAULT NULL,
  `driving_license_front_url` text DEFAULT NULL,
  `driving_license_back_url` text DEFAULT NULL,
  `cnic_is_verified` tinyint(1) DEFAULT 0,
  `driving_license_is_verified` tinyint(1) DEFAULT 0,
  `cnic_extracted_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`cnic_extracted_data`)),
  `driving_license_extracted_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`driving_license_extracted_data`)),
  `cnic_rejection_reason` text DEFAULT NULL,
  `driving_license_rejection_reason` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `vehicle_owners`
--

-- INSERT INTO `vehicle_owners` (`id`, `owner_name`, `father_name`, `cnic_no`, `phone_no`, `alternate_phone`, `address`, `city`, `notes`, `status`, `created_by`, `cnic_front_url`, `cnic_back_url`, `driving_license_front_url`, `driving_license_back_url`, `cnic_is_verified`, `driving_license_is_verified`, `cnic_extracted_data`, `driving_license_extracted_data`, `cnic_rejection_reason`, `driving_license_rejection_reason`, `created_at`, `updated_at`) VALUES
-- (1, 'Ikhlaq', NULL, '3447777744444', '034174747444', NULL, 'Makkah Colony, Gulberg-III', 'Lahore', NULL, 'active', 1, NULL, NULL, NULL, NULL, 0, 0, NULL, NULL, NULL, NULL, '2026-04-17 11:03:52', '2026-04-17 11:03:52');

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_return`
--

CREATE TABLE IF NOT EXISTS `vehicle_return` (
  `id` int(11) NOT NULL,
  `booking_id` int(11) NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `return_date` date NOT NULL,
  `total_days` int(11) NOT NULL,
  `late_days` int(11) DEFAULT 0,
  `extra_charges` decimal(12,2) DEFAULT 0.00,
  `damage_charges` decimal(12,2) DEFAULT 0.00,
  `final_amount` decimal(12,2) NOT NULL,
  `paid_amount` decimal(12,2) NOT NULL,
  `balance_amount` decimal(12,2) NOT NULL,
  `notes` text DEFAULT NULL,
  `returned_by` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_types`
--

CREATE TABLE IF NOT EXISTS `vehicle_types` (
  `id` int(11) NOT NULL,
  `name` varchar(50) NOT NULL,
  `description` text DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `vehicle_types`
--

-- INSERT INTO `vehicle_types` (`id`, `name`, `description`, `status`, `created_at`, `updated_at`) VALUES
-- (1, 'Sedan', NULL, 'active', '2026-04-17 06:15:49', '2026-04-17 06:15:49'),
-- (2, 'SUV', NULL, 'active', '2026-04-17 06:15:49', '2026-04-17 06:15:49'),
-- (3, 'Hatchback', NULL, 'active', '2026-04-17 06:15:49', '2026-04-17 06:15:49'),
-- (4, 'Coupe', NULL, 'active', '2026-04-17 06:15:49', '2026-04-17 06:15:49');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `bookings`
--
ALTER TABLE `bookings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `booking_code` (`booking_code`),
  ADD KEY `rent_type_id` (`rent_type_id`),
  ADD KEY `idx_bookings_customer` (`customer_id`),
  ADD KEY `idx_bookings_vehicle` (`vehicle_id`),
  ADD KEY `idx_bookings_dates` (`date_from`,`date_to`),
  ADD KEY `idx_bookings_status` (`status`);

--
-- Indexes for table `booking_payments`
--
ALTER TABLE `booking_payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `booking_id` (`booking_id`);

--
-- Indexes for table `booking_status_logs`
--
ALTER TABLE `booking_status_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `booking_id` (`booking_id`);

--
-- Indexes for table `cash_receipts`
--
ALTER TABLE `cash_receipts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `customer_id` (`customer_id`);

--
-- Indexes for table `customers`
--
ALTER TABLE `customers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_customers_phone` (`phone_no`);

--
-- Indexes for table `customer_references`
--
ALTER TABLE `customer_references`
  ADD PRIMARY KEY (`id`),
  ADD KEY `customer_id` (`customer_id`);

--
-- Indexes for table `earning_payments`
--
ALTER TABLE `earning_payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `earning_id` (`earning_id`),
  ADD KEY `booking_id` (`booking_id`);

--
-- Indexes for table `expense_vouchers`
--
ALTER TABLE `expense_vouchers`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `ledgers`
--
ALTER TABLE `ledgers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `customer_id` (`customer_id`),
  ADD KEY `vehicle_id` (`vehicle_id`),
  ADD KEY `idx_ledgers_date` (`created_at`),
  ADD KEY `idx_ledgers_type` (`entry_type`),
  ADD KEY `owner_id` (`owner_id`);

--
-- Indexes for table `owner_earnings`
--
ALTER TABLE `owner_earnings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_id` (`vehicle_id`),
  ADD KEY `idx_owner_id` (`owner_id`),
  ADD KEY `idx_booking_id` (`booking_id`),
  ADD KEY `idx_status` (`status`);

--
-- Indexes for table `rent_types`
--
ALTER TABLE `rent_types`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `idx_users_email` (`email`);

--
-- Indexes for table `vehicles`
--
ALTER TABLE `vehicles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `registration_no` (`registration_no`),
  ADD KEY `owner_id` (`owner_id`),
  ADD KEY `idx_vehicles_status` (`status`),
  ADD KEY `idx_vehicles_registration` (`registration_no`);

--
-- Indexes for table `vehicle_accessory_types`
--
ALTER TABLE `vehicle_accessory_types`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `vehicle_documents`
--
ALTER TABLE `vehicle_documents`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_id` (`vehicle_id`);

--
-- Indexes for table `vehicle_handover`
--
ALTER TABLE `vehicle_handover`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_handover_booking` (`booking_id`),
  ADD KEY `idx_handover_vehicle` (`vehicle_id`);

--
-- Indexes for table `vehicle_handover_accessories`
--
ALTER TABLE `vehicle_handover_accessories`
  ADD PRIMARY KEY (`id`),
  ADD KEY `handover_id` (`handover_id`),
  ADD KEY `accessory_type_id` (`accessory_type_id`);

--
-- Indexes for table `vehicle_images`
--
ALTER TABLE `vehicle_images`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_id` (`vehicle_id`);

--
-- Indexes for table `vehicle_maintenance_logs`
--
ALTER TABLE `vehicle_maintenance_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_id` (`vehicle_id`),
  ADD KEY `maintenance_type_id` (`maintenance_type_id`);

--
-- Indexes for table `vehicle_maintenance_types`
--
ALTER TABLE `vehicle_maintenance_types`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `vehicle_owners`
--
ALTER TABLE `vehicle_owners`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_owners_phone` (`phone_no`);

--
-- Indexes for table `vehicle_return`
--
ALTER TABLE `vehicle_return`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_id` (`vehicle_id`),
  ADD KEY `idx_return_booking` (`booking_id`);

--
-- Indexes for table `vehicle_types`
--
ALTER TABLE `vehicle_types`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `bookings`
--
ALTER TABLE `bookings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `booking_payments`
--
ALTER TABLE `booking_payments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=24;

--
-- AUTO_INCREMENT for table `booking_status_logs`
--
ALTER TABLE `booking_status_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cash_receipts`
--
ALTER TABLE `cash_receipts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `customers`
--
ALTER TABLE `customers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `customer_references`
--
ALTER TABLE `customer_references`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `earning_payments`
--
ALTER TABLE `earning_payments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `expense_vouchers`
--
ALTER TABLE `expense_vouchers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ledgers`
--
ALTER TABLE `ledgers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `owner_earnings`
--
ALTER TABLE `owner_earnings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `rent_types`
--
ALTER TABLE `rent_types`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `vehicles`
--
ALTER TABLE `vehicles`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `vehicle_accessory_types`
--
ALTER TABLE `vehicle_accessory_types`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `vehicle_documents`
--
ALTER TABLE `vehicle_documents`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_handover`
--
ALTER TABLE `vehicle_handover`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `vehicle_handover_accessories`
--
ALTER TABLE `vehicle_handover_accessories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `vehicle_images`
--
ALTER TABLE `vehicle_images`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `vehicle_maintenance_logs`
--
ALTER TABLE `vehicle_maintenance_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_maintenance_types`
--
ALTER TABLE `vehicle_maintenance_types`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_owners`
--
ALTER TABLE `vehicle_owners`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `vehicle_return`
--
ALTER TABLE `vehicle_return`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `vehicle_types`
--
ALTER TABLE `vehicle_types`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `bookings`
--
ALTER TABLE `bookings`
  ADD CONSTRAINT `bookings_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  ADD CONSTRAINT `bookings_ibfk_2` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`),
  ADD CONSTRAINT `bookings_ibfk_3` FOREIGN KEY (`rent_type_id`) REFERENCES `rent_types` (`id`);

--
-- Constraints for table `booking_payments`
--
ALTER TABLE `booking_payments`
  ADD CONSTRAINT `booking_payments_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `booking_status_logs`
--
ALTER TABLE `booking_status_logs`
  ADD CONSTRAINT `booking_status_logs_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `cash_receipts`
--
ALTER TABLE `cash_receipts`
  ADD CONSTRAINT `cash_receipts_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `customer_references`
--
ALTER TABLE `customer_references`
  ADD CONSTRAINT `customer_references_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `earning_payments`
--
ALTER TABLE `earning_payments`
  ADD CONSTRAINT `earning_payments_ibfk_1` FOREIGN KEY (`earning_id`) REFERENCES `owner_earnings` (`id`),
  ADD CONSTRAINT `earning_payments_ibfk_2` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`);

--
-- Constraints for table `ledgers`
--
ALTER TABLE `ledgers`
  ADD CONSTRAINT `ledgers_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `ledgers_ibfk_2` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `ledgers_ibfk_3` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `owner_earnings`
--
ALTER TABLE `owner_earnings`
  ADD CONSTRAINT `owner_earnings_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `vehicle_owners` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `owner_earnings_ibfk_2` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `owner_earnings_ibfk_3` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `vehicles`
--
ALTER TABLE `vehicles`
  ADD CONSTRAINT `vehicles_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `vehicle_owners` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `vehicle_documents`
--
ALTER TABLE `vehicle_documents`
  ADD CONSTRAINT `vehicle_documents_ibfk_1` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `vehicle_handover`
--
ALTER TABLE `vehicle_handover`
  ADD CONSTRAINT `vehicle_handover_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`),
  ADD CONSTRAINT `vehicle_handover_ibfk_2` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`);

--
-- Constraints for table `vehicle_handover_accessories`
--
ALTER TABLE `vehicle_handover_accessories`
  ADD CONSTRAINT `vehicle_handover_accessories_ibfk_1` FOREIGN KEY (`handover_id`) REFERENCES `vehicle_handover` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `vehicle_handover_accessories_ibfk_2` FOREIGN KEY (`accessory_type_id`) REFERENCES `vehicle_accessory_types` (`id`);

--
-- Constraints for table `vehicle_images`
--
ALTER TABLE `vehicle_images`
  ADD CONSTRAINT `vehicle_images_ibfk_1` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `vehicle_maintenance_logs`
--
ALTER TABLE `vehicle_maintenance_logs`
  ADD CONSTRAINT `vehicle_maintenance_logs_ibfk_1` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`),
  ADD CONSTRAINT `vehicle_maintenance_logs_ibfk_2` FOREIGN KEY (`maintenance_type_id`) REFERENCES `vehicle_maintenance_types` (`id`);

--
-- Constraints for table `vehicle_return`
--
ALTER TABLE `vehicle_return`
  ADD CONSTRAINT `vehicle_return_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`),
  ADD CONSTRAINT `vehicle_return_ibfk_2` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
