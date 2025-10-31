import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertBoatSchema, insertCustomerSchema, insertRentalSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Boats routes
  app.get("/api/boats", async (_req, res) => {
    try {
      const boats = await storage.getAllBoats();
      res.json(boats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch boats" });
    }
  });

  app.get("/api/boats/:id", async (req, res) => {
    try {
      const boat = await storage.getBoat(req.params.id);
      if (!boat) {
        return res.status(404).json({ error: "Boat not found" });
      }
      res.json(boat);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch boat" });
    }
  });

  app.post("/api/boats", async (req, res) => {
    try {
      const validatedData = insertBoatSchema.parse(req.body);
      const boat = await storage.createBoat(validatedData);
      res.status(201).json(boat);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: error.errors?.[0]?.message || "Validation failed" });
      } else if (error instanceof Error) {
        res.status(500).json({ error: "Server error" });
      } else {
        res.status(400).json({ error: "Invalid boat data" });
      }
    }
  });

  app.put("/api/boats/:id", async (req, res) => {
    try {
      const validatedData = insertBoatSchema.parse(req.body);
      const boat = await storage.updateBoat(req.params.id, validatedData);
      if (!boat) {
        return res.status(404).json({ error: "Boat not found" });
      }
      res.json(boat);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(400).json({ error: "Invalid boat data" });
      }
    }
  });

  app.delete("/api/boats/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteBoat(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Boat not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete boat" });
    }
  });

  // Customers routes
  app.get("/api/customers", async (_req, res) => {
    try {
      const customers = await storage.getAllCustomers();
      res.json(customers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  app.get("/api/customers/:id", async (req, res) => {
    try {
      const customer = await storage.getCustomer(req.params.id);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customer" });
    }
  });

  app.post("/api/customers", async (req, res) => {
    try {
      const validatedData = insertCustomerSchema.parse(req.body);
      const customer = await storage.createCustomer(validatedData);
      res.status(201).json(customer);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(400).json({ error: "Invalid customer data" });
      }
    }
  });

  app.put("/api/customers/:id", async (req, res) => {
    try {
      const validatedData = insertCustomerSchema.parse(req.body);
      const customer = await storage.updateCustomer(req.params.id, validatedData);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(400).json({ error: "Invalid customer data" });
      }
    }
  });

  app.delete("/api/customers/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCustomer(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Customer not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete customer" });
    }
  });

  // Rentals routes
  app.get("/api/rentals", async (_req, res) => {
    try {
      const rentals = await storage.getAllRentals();
      res.json(rentals);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch rentals" });
    }
  });

  app.get("/api/rentals/:id", async (req, res) => {
    try {
      const rental = await storage.getRental(req.params.id);
      if (!rental) {
        return res.status(404).json({ error: "Rental not found" });
      }
      res.json(rental);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch rental" });
    }
  });

  app.post("/api/rentals", async (req, res) => {
    try {
      const validatedData = insertRentalSchema.parse(req.body);
      
      // Validate that customer and boat exist
      const customer = await storage.getCustomer(validatedData.customerId);
      if (!customer) {
        return res.status(400).json({ error: "Customer not found" });
      }
      
      const boat = await storage.getBoat(validatedData.boatId);
      if (!boat) {
        return res.status(400).json({ error: "Boat not found" });
      }
      
      const rental = await storage.createRental(validatedData);
      res.status(201).json(rental);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: error.errors?.[0]?.message || "Validation failed" });
      } else if (error instanceof Error) {
        res.status(500).json({ error: "Server error" });
      } else {
        res.status(400).json({ error: "Invalid rental data" });
      }
    }
  });

  app.put("/api/rentals/:id", async (req, res) => {
    try {
      const validatedData = insertRentalSchema.parse(req.body);
      
      // Validate that customer and boat exist
      const customer = await storage.getCustomer(validatedData.customerId);
      if (!customer) {
        return res.status(400).json({ error: "Customer not found" });
      }
      
      const boat = await storage.getBoat(validatedData.boatId);
      if (!boat) {
        return res.status(400).json({ error: "Boat not found" });
      }
      
      const rental = await storage.updateRental(req.params.id, validatedData);
      if (!rental) {
        return res.status(404).json({ error: "Rental not found" });
      }
      res.json(rental);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: error.errors?.[0]?.message || "Validation failed" });
      } else if (error instanceof Error) {
        res.status(500).json({ error: "Server error" });
      } else {
        res.status(400).json({ error: "Invalid rental data" });
      }
    }
  });

  app.delete("/api/rentals/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteRental(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Rental not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete rental" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
