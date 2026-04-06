import { db } from "../../config/db.js";



// CREATE
export const createVehicleType = (req, res) => {
  const { name, description } = req.body;

  const sql = `INSERT INTO vehicle_types (name, description) VALUES (?, ?)`;

  db.query(sql, [name, description || null], (err, result) => {
    if (err) return res.status(500).json(err);

    res.json({ message: "Vehicle Type created", id: result.insertId });
  });
};

// GET ALL
export const getVehicleTypes = (req, res) => {
  const { page = 1, limit = 10, search = '', status = '' } = req.query;
  const offset = (page - 1) * limit;
  
  let query = "SELECT * FROM vehicle_types WHERE 1=1";
  const params = [];
  
  // Add search condition
  if (search) {
    query += " AND (name LIKE ? OR description LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }
  
  // Add status filter
  if (status) {
    query += " AND status = ?";
    params.push(status);
  }
  
  // Get total count
  const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
  db.query(countQuery, params, (err, countResult) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const total = countResult[0].total;
    
    // Get paginated results
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    db.query(query, [...params, parseInt(limit), parseInt(offset)], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json({
        success: true,
        data: rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    });
  });
};


// GET BY ID
export const getVehicleTypeById = (req, res) => {
  const { id } = req.params;

  db.query(
    "SELECT * FROM vehicle_types WHERE id=?",
    [id],
    (err, rows) => {
      if (err) return res.status(500).json(err);
      if (rows.length === 0)
        return res.status(404).json({ message: "Not found" });

      res.json(rows[0]);
    }
  );
};

// UPDATE
export const updateVehicleType = (req, res) => {
  const { id } = req.params;
  const { name, description, status } = req.body;

  const sql = `
    UPDATE vehicle_types
    SET name=?, description=?, status=?
    WHERE id=?
  `;

  db.query(sql, [name, description, status, id], (err) => {
    if (err) return res.status(500).json(err);

    res.json({ message: "Vehicle Type updated" });
  });
};

// DELETE
export const deleteVehicleType = (req, res) => {
  const { id } = req.params;

  db.query("DELETE FROM vehicle_types WHERE id=?", [id], (err) => {
    if (err) return res.status(500).json(err);

    res.json({ message: "Vehicle Type deleted" });
  });
};