import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, InputNumber, Select, message, Switch } from 'antd';

const { Option } = Select;

export default function InventoryTable({ currentUser, token }) {
  const [inventory, setInventory] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editRow, setEditRow] = useState({});
  const [orderForm] = Form.useForm();

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

  const fetchInventory = async () => {
    try {
      const res = await fetch(`${API_URL}/inventory`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      setInventory(json.inventory || []);
    } catch (err) {
      console.error('Failed to fetch inventory:', err);
    }
  };

  const fetchVendors = async () => {
    try {
      const res = await fetch(`${API_URL}/vendors`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      setVendors(json.vendors || []);
    } catch (err) {
      console.error('Failed to fetch vendors:', err);
    }
  };

  useEffect(() => {
    fetchInventory();
    fetchVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openOrderModal = (product) => {
    setSelectedProduct(product);
    setOrderModalOpen(true);
    orderForm.resetFields();
  };

  const handleOrder = async (values) => {
    if (!selectedProduct?.product_id) {
      message.error('No product selected for restocking');
      return;
    }

    const payload = {
      product_id: selectedProduct.product_id,
      vendor_id: values.vendor_id,
      quantity: values.quantity
    };

    try {
      const res = await fetch(`${API_URL}/inventory/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to place restock order');
      }

      message.success('Restock order placed');
      setOrderModalOpen(false);
      fetchInventory();
    } catch (err) {
      message.error(err.message || 'Failed to order');
    }
  };

  // ---- Inline editing helpers ----
  const startEdit = (record) => {
    setEditingId(record.product_id);
    setEditRow({
      product_id: record.product_id,
      stock: record.stock ?? 0,
      vendor_id: record.vendor_id ?? null,
      preferred: !!record.preferred,
      lead_time_days: record.lead_time_days ?? null
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditRow({});
  };

  const changeEdit = (field, value) => {
    setEditRow((prev) => ({ ...prev, [field]: value }));
  };

  const saveEdit = async (record) => {
    try {
      const patches = [];

      // A) Stock update (products)
      if (editRow.stock !== record.stock) {
        patches.push(
          fetch(`${API_URL}/products/${record.product_id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ stock: Number(editRow.stock) })
          })
            .then(async (r) => {
              if (!r.ok) throw new Error((await r.json()).error || 'Stock update failed');
            })
        );
      }

      // B) Vendor/preferred/lead time (product_vendors)
      const vendorChanged =
        editRow.vendor_id !== record.vendor_id ||
        editRow.preferred !== record.preferred ||
        (editRow.lead_time_days ?? null) !== (record.lead_time_days ?? null);

      if (vendorChanged) {
        if (!editRow.vendor_id) {
          message.error('Please select a vendor to save vendor changes');
          return;
        }

        patches.push(
          fetch(`${API_URL}/inventory/${record.product_id}/vendor`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              vendor_id: editRow.vendor_id,
              preferred: !!editRow.preferred,
              lead_time_days: editRow.lead_time_days != null ? Number(editRow.lead_time_days) : null
            })
          })
            .then(async (r) => {
              if (!r.ok) throw new Error((await r.json()).error || 'Vendor update failed');
            })
        );
      }

      if (patches.length === 0) {
        message.info('No changes to save');
        cancelEdit();
        return;
      }

      await Promise.all(patches);
      message.success('Inventory updated');
      cancelEdit();
      fetchInventory(); // refresh to get nested vendor data correct
    } catch (err) {
      console.error(err);
      message.error(err.message || 'Update failed');
    }
  };

  const columns = [
    { title: 'Product', dataIndex: 'product_name', key: 'product_name', width: 260, ellipsis: true },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 160, ellipsis: true },
    {
      title: 'Stock',
      dataIndex: 'stock',
      key: 'stock',
      width: 120,
      align: 'right',
      render: (_, record) =>
        editingId === record.product_id ? (
          <InputNumber
            min={0}
            value={editRow.stock}
            onChange={(v) => changeEdit('stock', v)}
            style={{ width: '100%' }}
          />
        ) : (
          record.stock
        )
    },
    {
      title: 'Vendor',
      key: 'vendor',
      width: 260,
      render: (_, record) =>
        editingId === record.product_id ? (
          <Select
            placeholder="Select vendor"
            value={editRow.vendor_id}
            onChange={(v) => changeEdit('vendor_id', v)}
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="children"
          >
            {vendors.map((v) => (
              <Option key={v.vendor_id} value={v.vendor_id}>
                {v.vendor_name}
              </Option>
            ))}
          </Select>
        ) : (
          record.vendor_name ? `${record.vendor_name}${record.supply_price ? ` ($${record.supply_price})` : ''}` : '—'
        )
    },
    {
      title: 'Preferred',
      key: 'preferred',
      width: 120,
      align: 'center',
      render: (_, record) =>
        editingId === record.product_id ? (
          <Switch
            checked={!!editRow.preferred}
            onChange={(checked) => changeEdit('preferred', checked)}
          />
        ) : record.preferred ? 'Yes' : '—'
    },
    {
      title: 'Lead Time',
      key: 'lead',
      width: 140,
      align: 'right',
      render: (_, record) =>
        editingId === record.product_id ? (
          <InputNumber
            min={0}
            value={editRow.lead_time_days}
            onChange={(v) => changeEdit('lead_time_days', v)}
            style={{ width: '100%' }}
          />
        ) : record.lead_time_days != null ? `${record.lead_time_days} days` : '—'
    },
    {
      title: 'Action',
      key: 'action',
      fixed: 'right',
      width: 220,
      render: (_, record) => (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {editingId === record.product_id ? (
            <>
              <Button type="primary" onClick={() => saveEdit(record)}>Save</Button>
              <Button onClick={cancelEdit}>Cancel</Button>
            </>
          ) : (
            <>
              <Button type="default" onClick={() => startEdit(record)}>Edit</Button>
              <Button type="primary" onClick={() => openOrderModal(record)}>Order More</Button>
            </>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm w-full">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Inventory</h2>
        <div>
          <Button onClick={fetchInventory}>Refresh</Button>
        </div>
      </div>

      <Table
        dataSource={inventory}
        columns={columns}
        rowKey="product_id"
        pagination={{ pageSize: 10, showSizeChanger: true }}
        bordered
        size="middle"
        sticky
        scroll={{ x: 980 }}
      />

      <Modal
        open={orderModalOpen}
        title={`Order More: ${selectedProduct?.product_name || ''}`}
        onCancel={() => setOrderModalOpen(false)}
        footer={null}
      >
        <Form form={orderForm} layout="vertical" onFinish={handleOrder}>
          <Form.Item
            name="vendor_id"
            label="Vendor"
            rules={[{ required: true, message: 'Please select a vendor' }]}
          >
            <Select placeholder="Select a vendor">
              {vendors.map((v) => (
                <Option key={v.vendor_id} value={v.vendor_id}>
                  {v.vendor_name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="quantity"
            label="Quantity"
            rules={[{ required: true, message: 'Enter quantity' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit">
              Place Order
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
