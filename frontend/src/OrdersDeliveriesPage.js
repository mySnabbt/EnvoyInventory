import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "./components/ui/card";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "./components/ui/table";
import { Badge } from "./components/ui/badge";
import { Skeleton } from "./components/ui/skeleton";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

function fmtNum(n) {
  if (n === null || n === undefined) return "—";
  const num = Number(n);
  return Number.isFinite(num) ? num.toLocaleString() : String(n);
}

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function StatusBadge({ status }) {
  const s = String(status || "").toUpperCase();
  const variant =
    s === "COMPLETED"
      ? "default"
      : s === "APPROVED"
      ? "secondary"
      : s === "REJECTED"
      ? "destructive"
      : "outline"; // PENDING / unknown
  return <Badge variant={variant} className="uppercase">{s || "—"}</Badge>;
}

export default function OrdersDeliveriesPage({ token }) {
  const [orders, setOrders] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null); // restock_id being processed

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [oRes, dRes] = await Promise.all([
        fetch(`${API_URL}/restock/orders`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/restock/deliveries`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const [oJson, dJson] = await Promise.all([oRes.json(), dRes.json()]);

      if (!oRes.ok) throw new Error(oJson.error || 'Failed to load restock orders');
      if (!dRes.ok) throw new Error(dJson.error || 'Failed to load restock deliveries');

      setOrders(oJson.orders || []);
      setDeliveries(dJson.deliveries || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);


  const markDelivered = useCallback(
    async (restockId) => {
      try {
        setActionLoading(restockId);

        const res = await fetch(`${API_URL}/restock/orders/${restockId}/deliver`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}), // or { notes: '...' }
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to mark delivered');

        // refresh both tables
        await fetchAll();
      } catch (err) {
        console.error('Mark delivered failed:', err);
        window.alert(err.message || 'Failed to mark delivered');
      } finally {
        setActionLoading(null);
      }
    },
    [token] // optionally include fetchAll if your linter requires it
  );


  useEffect(() => {
    fetchAll();
  }, []);

  const orderColumns = useMemo(() => [
    { key: "restock_id", label: "ID", className: "w-[80px] whitespace-nowrap" },
    {
      key: "product_id",
      label: "Product",
      className: "max-w-[16rem] truncate",
      render: (_, row) => row?.products?.product_name ?? row.product_id ?? "—",
    },
    {
      key: "vendor_id",
      label: "Vendor",
      className: "max-w-[14rem] truncate",
      render: (_, row) => row?.vendors?.vendor_name ?? row.vendor_id ?? "—",
    },
    {
      key: "quantity",
      label: "Qty",
      className: "w-[80px] text-right",
      render: (v) => <span className="tabular-nums">{fmtNum(v)}</span>,
    },
    {
      key: "status",
      label: "Status",
      className: "w-[120px]",
      render: (v) => <StatusBadge status={v} />,
    },
    {
      key: "requested_by",
      label: "Requested By",
      className: "w-[120px] text-right",
      render: (v) => <span className="tabular-nums">{fmtNum(v)}</span>,
    },
    { key: "requested_at", label: "Requested At", className: "whitespace-nowrap", render: fmtDate },
    { key: "expected_delivery", label: "Expected", className: "whitespace-nowrap", render: fmtDate },
    { key: "updated_at", label: "Updated", className: "whitespace-nowrap", render: fmtDate },
    {
      key: "actions",
      label: "Actions",
      className: "w-[140px]",
      render: (_, row) => (
        <button
          onClick={() => markDelivered(row.restock_id)}
          disabled={actionLoading === row.restock_id}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
          title="Mark as delivered"
        >
          {actionLoading === row.restock_id ? "Saving…" : "Delivered"}
        </button>
      ),
    },
  ], [markDelivered, actionLoading]);

  const deliveryColumns = useMemo(() => [
    { key: "delivery_id", label: "ID", className: "w-[80px] whitespace-nowrap" },
    {
      key: "restock_id",
      label: "Order ID",
      className: "w-[100px] text-right",
      render: (v) => <span className="tabular-nums">{fmtNum(v)}</span>,
    },
    {
      key: "product_id",
      label: "Product",
      className: "max-w-[16rem] truncate",
      render: (_, row) => row?.products?.product_name ?? row.product_id ?? "—",
    },
    {
      key: "quantity_received",
      label: "Delivered",
      className: "w-[120px] text-right",
      render: (v) => <span className="tabular-nums">{fmtNum(v)}</span>,
    },
    { key: "received_at", label: "Received At", className: "whitespace-nowrap", render: fmtDate },
    { key: "notes", label: "Notes", className: "max-w-[24rem] truncate" },
  ], []);

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto px-4">
      {/* Restock Orders */}
      <Card className="border bg-card text-card-foreground shadow-sm rounded-2xl">
        <CardHeader className="pb-0 flex-row items-center justify-between">
          <CardTitle className="text-lg">Restock Orders</CardTitle>
          <button
            onClick={fetchAll}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Refresh
          </button>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <div className="w-full overflow-x-auto max-h-[420px] rounded-xl border">
              <Table className="text-sm">
                <TableHeader className="sticky top-0 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                  <TableRow className="[&>*]:py-2 [&>*]:px-3">
                    {orderColumns.map((col) => (
                      <TableHead key={col.key} className={col.className}>
                        {col.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={orderColumns.length}
                        className="text-center text-muted-foreground"
                      >
                        No restock orders found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map((row) => (
                      <TableRow
                        key={row.restock_id}
                        className="hover:bg-muted/40 even:bg-muted/20 [&>*]:py-2 [&>*]:px-3"
                      >
                        {orderColumns.map((col) => (
                          <TableCell key={col.key} className={col.className}>
                            {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "—")}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restock Deliveries */}
      <Card className="border bg-card text-card-foreground shadow-sm rounded-2xl">
        <CardHeader className="pb-0 flex-row items-center justify-between">
          <CardTitle className="text-lg">Restock Deliveries</CardTitle>
          <button
            onClick={fetchAll}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Refresh
          </button>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="text-sm">
                <TableHeader className="sticky top-0 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                  <TableRow className="[&>*]:py-2 [&>*]:px-3">
                    {deliveryColumns.map((col) => (
                      <TableHead key={col.key} className={col.className}>
                        {col.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={deliveryColumns.length}
                        className="text-center text-muted-foreground"
                      >
                        No deliveries recorded.
                      </TableCell>
                    </TableRow>
                  ) : (
                    deliveries.map((row) => (
                      <TableRow
                        key={row.delivery_id}
                        className="hover:bg-muted/40 even:bg-muted/20 [&>*]:py-2 [&>*]:px-3"
                      >
                        {deliveryColumns.map((col) => (
                          <TableCell key={col.key} className={col.className}>
                            {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "—")}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
