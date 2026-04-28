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

-- Create owner_documents table for railway manual
CREATE TABLE IF NOT EXISTS owner_documents (
    id INT PRIMARY KEY AUTO_INCREMENT,
    owner_id INT NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    file_url TEXT,
    public_id VARCHAR(255),
    is_verified BOOLEAN DEFAULT FALSE,
    rejection_reason TEXT,
    extracted_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_owner_id (owner_id),
    INDEX idx_document_type (document_type),
    INDEX idx_is_verified (is_verified),
    FOREIGN KEY (owner_id) REFERENCES vehicle_owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add comments for documentation
ALTER TABLE owner_documents 
    COMMENT = 'Stores document files for vehicle owners with OCR verification results';
