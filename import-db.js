import fs from "fs";
import mysql from "mysql2/promise";

const connection = await mysql.createConnection({
  host: "shinkansen.proxy.rlwy.net",
  port: 27421,
  user: "root",
  password: "GZEtkkORYFniZLwjeBlZBrtAgNOBLcAW",
  database: "railway",
  multipleStatements: true,
});

const sql = fs.readFileSync(
  new URL("./config/defaultdb.sql", import.meta.url),
  "utf8"
);

await connection.query(sql);

console.log("✅ Database Imported Successfully");
process.exit();