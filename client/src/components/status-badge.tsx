import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, XCircle, Archive, Wrench, AlertCircle } from "lucide-react";

interface StatusBadgeProps {
  status: string;
  type?: "boat" | "rental";
}

export function StatusBadge({ status, type = "boat" }: StatusBadgeProps) {
  const getBoatStatusConfig = (status: string) => {
    switch (status) {
      case "available":
        return {
          label: "Available",
          icon: CheckCircle,
          className: "bg-green-100 text-green-800 border-green-200",
        };
      case "rented":
        return {
          label: "Rented",
          icon: Clock,
          className: "bg-blue-100 text-blue-800 border-blue-200",
        };
      case "maintenance":
        return {
          label: "Maintenance",
          icon: Wrench,
          className: "bg-yellow-100 text-yellow-800 border-yellow-200",
        };
      case "unavailable":
        return {
          label: "Unavailable",
          icon: AlertCircle,
          className: "bg-gray-100 text-gray-800 border-gray-200",
        };
      default:
        return {
          label: status,
          icon: AlertCircle,
          className: "bg-gray-100 text-gray-800 border-gray-200",
        };
    }
  };

  const getRentalStatusConfig = (status: string) => {
    switch (status) {
      case "pending":
        return {
          label: "Pending",
          icon: Clock,
          className: "bg-orange-100 text-orange-800 border-orange-200",
        };
      case "confirmed":
        return {
          label: "Confirmed",
          icon: CheckCircle,
          className: "bg-green-100 text-green-800 border-green-200",
        };
      case "active":
        return {
          label: "Active",
          icon: CheckCircle,
          className: "bg-blue-100 text-blue-800 border-blue-200",
        };
      case "completed":
        return {
          label: "Completed",
          icon: Archive,
          className: "bg-gray-100 text-gray-800 border-gray-200",
        };
      case "cancelled":
        return {
          label: "Cancelled",
          icon: XCircle,
          className: "bg-red-100 text-red-800 border-red-200",
        };
      default:
        return {
          label: status,
          icon: AlertCircle,
          className: "bg-gray-100 text-gray-800 border-gray-200",
        };
    }
  };

  const config = type === "boat" ? getBoatStatusConfig(status) : getRentalStatusConfig(status);
  const Icon = config.icon;

  return (
    <Badge className={`${config.className} flex items-center gap-1 w-fit`} data-testid={`badge-status-${status}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}
