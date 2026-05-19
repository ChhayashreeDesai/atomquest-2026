import { Router } from "express";
import {
  getAllEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getAllManagers,
} from "../controllers/userManagementController.js";
import { requireRole } from "../middleware/authMiddleware.js";

const router = Router();

// Admin: Get all employees
router.get("/employees", requireRole("ADMIN"), getAllEmployees);

// Admin: Create new employee
router.post("/employees", requireRole("ADMIN"), createEmployee);

// Admin: Update employee
router.put("/employees/:userId", requireRole("ADMIN"), updateEmployee);

// Admin: Delete employee
router.delete("/employees/:userId", requireRole("ADMIN"), deleteEmployee);

// Admin: Get all managers
router.get("/managers", requireRole("ADMIN"), getAllManagers);

export default router;
