// backend/models/SetupModel.js
import { db } from "../config/db.js";

class SetupModel {
  // Map logical model names to actual table names
  static getTableName(modelName) {
    const tableMap = {
      'vehicle-type': 'vehicle_types',
      'maintenance-type': 'vehicle_maintenance_types',
      'rent-type': 'rent_types',
      'accessory-type': 'vehicle_accessory_types',
      'payment-type': 'payment_types',
      'fuel-type': 'fuel_types',
      'insurance-type': 'insurance_types'
    };
    return tableMap[modelName];
  }

  static async createModelTable(modelName) {
    const tableName = this.getTableName(modelName);
    if (!tableName) return;
    
    const query = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        status ENUM('active', 'inactive') DEFAULT 'active',
        module_type VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_status (status),
        INDEX idx_module_type (module_type)
      )
    `;
    await db.execute(query);
  }

  static async create(modelName, data) {
    const tableName = this.getTableName(modelName);
    if (!tableName) throw new Error(`Invalid model name: ${modelName}`);
    
    const { name, description, status = 'active', module_type } = data;
    const query = `INSERT INTO ${tableName} (name, description, status, module_type) VALUES (?, ?, ?, ?)`;
    const [result] = await db.execute(query, [name, description, status, module_type]);
    return this.findById(modelName, result.insertId);
  }

  static async findAll(modelName, filters = {}) {
    const tableName = this.getTableName(modelName);
    if (!tableName) throw new Error(`Invalid model name: ${modelName}`);
    
    const { page = 1, limit = 10, search = '', status = '' } = filters;
    const offset = (page - 1) * limit;
    
    let query = `SELECT * FROM ${tableName} WHERE module_type = ?`;
    const params = [modelName];
    
    if (search) {
      query += ` AND (name LIKE ? OR description LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    
    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }
    
    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const [countResult] = await db.execute(countQuery, params);
    const total = countResult[0].total;
    
    // Get paginated results
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const [rows] = await db.execute(query, [...params, parseInt(limit), parseInt(offset)]);
    
    return {
      data: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  static async findById(modelName, id) {
    const tableName = this.getTableName(modelName);
    if (!tableName) throw new Error(`Invalid model name: ${modelName}`);
    
    const query = `SELECT * FROM ${tableName} WHERE id = ? AND module_type = ?`;
    const [rows] = await db.execute(query, [id, modelName]);
    return rows[0];
  }

  static async updateById(modelName, id, data) {
    const tableName = this.getTableName(modelName);
    if (!tableName) throw new Error(`Invalid model name: ${modelName}`);
    
    const { name, description, status } = data;
    const query = `UPDATE ${tableName} SET name = ?, description = ?, status = ? WHERE id = ? AND module_type = ?`;
    await db.execute(query, [name, description, status, id, modelName]);
    return this.findById(modelName, id);
  }

  static async deleteById(modelName, id) {
    const tableName = this.getTableName(modelName);
    if (!tableName) throw new Error(`Invalid model name: ${modelName}`);
    
    const item = await this.findById(modelName, id);
    if (!item) return null;
    
    const query = `DELETE FROM ${tableName} WHERE id = ? AND module_type = ?`;
    await db.execute(query, [id, modelName]);
    return item;
  }
}

export default SetupModel;