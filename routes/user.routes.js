import { db } from "../config/db.js";

export const userRoutes = (app) => {
    app.get("/", (req, res) => {
        db.query("SELECT * FROM users", (err, result) => {
            if (err) {
                console.log(err);
            } else {
                res.send(result);
            }
        });
    });
};
