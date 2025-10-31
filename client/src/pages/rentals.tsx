import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Calendar as CalendarIcon, Pencil } from "lucide-react";
import { Rental, InsertRental, insertRentalSchema, Boat, Customer } from "@shared/schema";
import { StatusBadge } from "@/components/status-badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format, differenceInDays, parseISO } from "date-fns";

export default function Rentals() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRental, setEditingRental] = useState<Rental | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [rentalToDelete, setRentalToDelete] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: rentals = [], isLoading: rentalsLoading } = useQuery<Rental[]>({
    queryKey: ["/api/rentals"],
  });

  const { data: boats = [] } = useQuery<Boat[]>({
    queryKey: ["/api/boats"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const form = useForm<InsertRental>({
    resolver: zodResolver(insertRentalSchema),
    defaultValues: {
      customerId: "",
      boatId: "",
      startDate: "",
      endDate: "",
      status: "pending",
      totalPrice: 0,
    },
  });

  const watchStartDate = form.watch("startDate");
  const watchEndDate = form.watch("endDate");
  const watchBoatId = form.watch("boatId");

  // Auto-calculate total price when dates or boat changes
  useEffect(() => {
    if (watchStartDate && watchEndDate && watchBoatId && !editingRental) {
      const boat = boats.find((b) => b.id === watchBoatId);
      if (boat) {
        try {
          const start = new Date(watchStartDate);
          const end = new Date(watchEndDate);
          const days = differenceInDays(end, start) + 1;
          if (days > 0 && !isNaN(days)) {
            const pricePerDay = parseFloat(boat.pricePerDay);
            const total = days * pricePerDay;
            form.setValue("totalPrice", parseFloat(total.toFixed(2)));
          }
        } catch (e) {
          // Invalid date
        }
      }
    }
  }, [watchStartDate, watchEndDate, watchBoatId, boats, editingRental, form]);

  const createMutation = useMutation({
    mutationFn: (data: InsertRental) => apiRequest("POST", "/api/rentals", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rentals"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Rental created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create rental", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: InsertRental }) =>
      apiRequest("PUT", `/api/rentals/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rentals"] });
      setIsDialogOpen(false);
      setEditingRental(null);
      form.reset();
      toast({ title: "Rental updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update rental", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/rentals/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rentals"] });
      setDeleteDialogOpen(false);
      setRentalToDelete(null);
      toast({ title: "Rental deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete rental", variant: "destructive" });
    },
  });

  const handleOpenDialog = (rental?: Rental) => {
    if (rental) {
      setEditingRental(rental);
      form.reset({
        customerId: rental.customerId,
        boatId: rental.boatId,
        startDate: rental.startDate,
        endDate: rental.endDate,
        status: rental.status as any,
        totalPrice: rental.totalPrice,
      });
    } else {
      setEditingRental(null);
      form.reset({
        customerId: "",
        boatId: "",
        startDate: "",
        endDate: "",
        status: "pending",
        totalPrice: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: InsertRental) => {
    if (editingRental) {
      updateMutation.mutate({ id: editingRental.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (id: string) => {
    setRentalToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (rentalToDelete) {
      deleteMutation.mutate(rentalToDelete);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Rentals</h1>
          <p className="text-muted-foreground mt-2">
            Manage boat rental bookings
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()} data-testid="button-add-rental">
          <Plus className="w-4 h-4 mr-2" />
          New Booking
        </Button>
      </div>

      {rentalsLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted rounded animate-pulse"></div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : rentals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CalendarIcon className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No rentals yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Create your first booking to get started
            </p>
            <Button onClick={() => handleOpenDialog()} data-testid="button-add-first-rental">
              <Plus className="w-4 h-4 mr-2" />
              Create First Booking
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium">Rental Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Boat</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rentals.map((rental) => {
                  const customer = customers.find((c) => c.id === rental.customerId);
                  const boat = boats.find((b) => b.id === rental.boatId);
                  return (
                    <TableRow key={rental.id} data-testid={`row-rental-${rental.id}`}>
                      <TableCell className="font-medium">{customer?.name || "Unknown"}</TableCell>
                      <TableCell>{boat?.name || "Unknown"}</TableCell>
                      <TableCell>{rental.startDate}</TableCell>
                      <TableCell>{rental.endDate}</TableCell>
                      <TableCell className="font-mono">${rental.totalPrice}</TableCell>
                      <TableCell>
                        <StatusBadge status={rental.status} type="rental" />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(rental)}
                            data-testid={`button-edit-rental-${rental.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(rental.id)}
                            data-testid={`button-delete-rental-${rental.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRental ? "Edit Rental" : "New Booking"}</DialogTitle>
            <DialogDescription>
              {editingRental ? "Update rental information" : "Create a new boat rental booking"}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-customer">
                            <SelectValue placeholder="Select customer" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="boatId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Boat *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-boat">
                            <SelectValue placeholder="Select boat" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {boats.map((boat) => (
                            <SelectItem key={boat.id} value={boat.id}>
                              {boat.name} - ${boat.pricePerDay}/day
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date *</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" data-testid="input-start-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Date *</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" data-testid="input-end-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-rental-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="totalPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Price *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Auto-calculated"
                          data-testid="input-total-price"
                          readOnly={!editingRental}
                          value={field.value}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-rental"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "Saving..."
                    : editingRental
                    ? "Update Rental"
                    : "Create Booking"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Rental</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this rental? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
