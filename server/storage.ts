import {
  type Boat,
  type InsertBoat,
  type Customer,
  type InsertCustomer,
  type Rental,
  type InsertRental,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Boats
  getAllBoats(): Promise<Boat[]>;
  getBoat(id: string): Promise<Boat | undefined>;
  createBoat(boat: InsertBoat): Promise<Boat>;
  updateBoat(id: string, boat: InsertBoat): Promise<Boat | undefined>;
  deleteBoat(id: string): Promise<boolean>;

  // Customers
  getAllCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, customer: InsertCustomer): Promise<Customer | undefined>;
  deleteCustomer(id: string): Promise<boolean>;

  // Rentals
  getAllRentals(): Promise<Rental[]>;
  getRental(id: string): Promise<Rental | undefined>;
  createRental(rental: InsertRental): Promise<Rental>;
  updateRental(id: string, rental: InsertRental): Promise<Rental | undefined>;
  deleteRental(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private boats: Map<string, Boat>;
  private customers: Map<string, Customer>;
  private rentals: Map<string, Rental>;

  constructor() {
    this.boats = new Map();
    this.customers = new Map();
    this.rentals = new Map();
  }

  // Boats
  async getAllBoats(): Promise<Boat[]> {
    return Array.from(this.boats.values());
  }

  async getBoat(id: string): Promise<Boat | undefined> {
    return this.boats.get(id);
  }

  async createBoat(insertBoat: InsertBoat): Promise<Boat> {
    const id = randomUUID();
    const boat: Boat = { ...insertBoat, id };
    this.boats.set(id, boat);
    return boat;
  }

  async updateBoat(id: string, insertBoat: InsertBoat): Promise<Boat | undefined> {
    const existing = this.boats.get(id);
    if (!existing) {
      return undefined;
    }
    const updated: Boat = { ...insertBoat, id };
    this.boats.set(id, updated);
    return updated;
  }

  async deleteBoat(id: string): Promise<boolean> {
    return this.boats.delete(id);
  }

  // Customers
  async getAllCustomers(): Promise<Customer[]> {
    return Array.from(this.customers.values());
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    return this.customers.get(id);
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const id = randomUUID();
    const customer: Customer = { ...insertCustomer, id };
    this.customers.set(id, customer);
    return customer;
  }

  async updateCustomer(id: string, insertCustomer: InsertCustomer): Promise<Customer | undefined> {
    const existing = this.customers.get(id);
    if (!existing) {
      return undefined;
    }
    const updated: Customer = { ...insertCustomer, id };
    this.customers.set(id, updated);
    return updated;
  }

  async deleteCustomer(id: string): Promise<boolean> {
    return this.customers.delete(id);
  }

  // Rentals
  async getAllRentals(): Promise<Rental[]> {
    return Array.from(this.rentals.values());
  }

  async getRental(id: string): Promise<Rental | undefined> {
    return this.rentals.get(id);
  }

  async createRental(insertRental: InsertRental): Promise<Rental> {
    const id = randomUUID();
    const rental: Rental = { ...insertRental, id };
    this.rentals.set(id, rental);
    return rental;
  }

  async updateRental(id: string, insertRental: InsertRental): Promise<Rental | undefined> {
    const existing = this.rentals.get(id);
    if (!existing) {
      return undefined;
    }
    const updated: Rental = { ...insertRental, id };
    this.rentals.set(id, updated);
    return updated;
  }

  async deleteRental(id: string): Promise<boolean> {
    return this.rentals.delete(id);
  }
}

export const storage = new MemStorage();
