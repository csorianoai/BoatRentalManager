import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Pencil, Trash2, Ship } from "lucide-react";
import { Boat, InsertBoat, insertBoatSchema } from "@shared/schema";
import { StatusBadge } from "@/components/status-badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function Boats() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBoat, setEditingBoat] = useState<Boat | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [boatToDelete, setBoatToDelete] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: boats = [], isLoading } = useQuery<Boat[]>({
    queryKey: ["/api/boats"],
  });

  const form = useForm<InsertBoat>({
    resolver: zodResolver(insertBoatSchema),
    defaultValues: {
      name: "",
      type: "",
      capacity: 1,
      pricePerDay: 0,
      status: "available",
      imageUrl: "",
      description: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertBoat) => apiRequest("POST", "/api/boats", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boats"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Boat created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create boat", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: InsertBoat }) =>
      apiRequest("PUT", `/api/boats/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boats"] });
      setIsDialogOpen(false);
      setEditingBoat(null);
      form.reset();
      toast({ title: "Boat updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update boat", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/boats/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boats"] });
      setDeleteDialogOpen(false);
      setBoatToDelete(null);
      toast({ title: "Boat deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete boat", variant: "destructive" });
    },
  });

  const handleOpenDialog = (boat?: Boat) => {
    if (boat) {
      setEditingBoat(boat);
      form.reset({
        name: boat.name,
        type: boat.type,
        capacity: boat.capacity,
        pricePerDay: boat.pricePerDay,
        status: boat.status as any,
        imageUrl: boat.imageUrl || "",
        description: boat.description || "",
      });
    } else {
      setEditingBoat(null);
      form.reset({
        name: "",
        type: "",
        capacity: 1,
        pricePerDay: "",
        status: "available",
        imageUrl: "",
        description: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: InsertBoat) => {
    if (editingBoat) {
      updateMutation.mutate({ id: editingBoat.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (id: string) => {
    setBoatToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (boatToDelete) {
      deleteMutation.mutate(boatToDelete);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Boats</h1>
          <p className="text-muted-foreground mt-2">
            Manage your boat inventory
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()} data-testid="button-add-boat">
          <Plus className="w-4 h-4 mr-2" />
          Add Boat
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted rounded animate-pulse"></div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : boats.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Ship className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No boats yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Get started by adding your first boat to the inventory
            </p>
            <Button onClick={() => handleOpenDialog()} data-testid="button-add-first-boat">
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Boat
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium">Boat Inventory</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Price/Day</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {boats.map((boat) => (
                  <TableRow key={boat.id} data-testid={`row-boat-${boat.id}`}>
                    <TableCell className="font-medium">{boat.name}</TableCell>
                    <TableCell className="capitalize">{boat.type}</TableCell>
                    <TableCell>{boat.capacity} people</TableCell>
                    <TableCell className="font-mono">${boat.pricePerDay}</TableCell>
                    <TableCell>
                      <StatusBadge status={boat.status} type="boat" />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(boat)}
                          data-testid={`button-edit-boat-${boat.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(boat.id)}
                          data-testid={`button-delete-boat-${boat.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBoat ? "Edit Boat" : "Add New Boat"}</DialogTitle>
            <DialogDescription>
              {editingBoat ? "Update boat information" : "Add a new boat to your inventory"}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Boat Name *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Sea Breeze" data-testid="input-boat-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Sailboat, Yacht" data-testid="input-boat-type" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="capacity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Capacity *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min="1"
                          placeholder="Number of people"
                          data-testid="input-boat-capacity"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="pricePerDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price per Day *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="e.g., 199.99"
                          data-testid="input-boat-price"
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
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
                          <SelectTrigger data-testid="select-boat-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="available">Available</SelectItem>
                          <SelectItem value="rented">Rented</SelectItem>
                          <SelectItem value="maintenance">Maintenance</SelectItem>
                          <SelectItem value="unavailable">Unavailable</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="imageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Image URL</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="https://..." data-testid="input-boat-image" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Brief description of the boat..."
                        className="resize-none"
                        rows={3}
                        data-testid="input-boat-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                  data-testid="button-save-boat"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "Saving..."
                    : editingBoat
                    ? "Update Boat"
                    : "Add Boat"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Boat</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this boat? This action cannot be undone.
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
