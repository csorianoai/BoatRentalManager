import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Ship, Calendar, Users, DollarSign } from "lucide-react";
import { Boat, Rental, Customer } from "@shared/schema";

export default function Dashboard() {
  const { data: boats = [], isLoading: boatsLoading } = useQuery<Boat[]>({
    queryKey: ["/api/boats"],
  });

  const { data: rentals = [], isLoading: rentalsLoading } = useQuery<Rental[]>({
    queryKey: ["/api/rentals"],
  });

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const totalBoats = boats.length;
  const availableBoats = boats.filter((b) => b.status === "available").length;
  const activeRentals = rentals.filter((r) => r.status === "active" || r.status === "confirmed").length;
  const totalRevenue = rentals
    .filter((r) => r.status === "completed")
    .reduce((sum, r) => sum + parseFloat(r.totalPrice || "0"), 0);

  const stats = [
    {
      title: "Total Boats",
      value: totalBoats,
      description: `${availableBoats} available`,
      icon: Ship,
      color: "text-blue-600",
    },
    {
      title: "Active Rentals",
      value: activeRentals,
      description: "Currently rented",
      icon: Calendar,
      color: "text-green-600",
    },
    {
      title: "Total Customers",
      value: customers.length,
      description: "Registered",
      icon: Users,
      color: "text-purple-600",
    },
    {
      title: "Revenue",
      value: `$${totalRevenue.toFixed(2)}`,
      description: "From completed rentals",
      icon: DollarSign,
      color: "text-emerald-600",
    },
  ];

  const isLoading = boatsLoading || rentalsLoading || customersLoading;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Overview of your boat rental business
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 bg-muted rounded w-24"></div>
                <div className="h-4 w-4 bg-muted rounded"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-16 mb-2"></div>
                <div className="h-3 bg-muted rounded w-32"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => (
            <Card key={stat.title} data-testid={`card-stat-${stat.title.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid={`text-stat-${stat.title.toLowerCase().replace(/\s+/g, "-")}-value`}>
                  {stat.value}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {rentals.length === 0 ? (
              <p className="text-muted-foreground text-sm">No rental activity yet</p>
            ) : (
              <div className="space-y-4">
                {rentals.slice(0, 5).map((rental) => {
                  const boat = boats.find((b) => b.id === rental.boatId);
                  const customer = customers.find((c) => c.id === rental.customerId);
                  return (
                    <div key={rental.id} className="flex justify-between items-start text-sm">
                      <div>
                        <p className="font-medium">{customer?.name || "Unknown Customer"}</p>
                        <p className="text-muted-foreground text-xs">
                          {boat?.name || "Unknown Boat"} - {rental.startDate} to {rental.endDate}
                        </p>
                      </div>
                      <p className="font-medium">${rental.totalPrice}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium">Fleet Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {boats.length === 0 ? (
              <p className="text-muted-foreground text-sm">No boats in inventory</p>
            ) : (
              <div className="space-y-3">
                {["available", "rented", "maintenance", "unavailable"].map((status) => {
                  const count = boats.filter((b) => b.status === status).length;
                  if (count === 0) return null;
                  return (
                    <div key={status} className="flex justify-between items-center">
                      <span className="text-sm capitalize">{status}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
