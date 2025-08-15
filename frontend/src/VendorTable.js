import React, { useEffect, useState } from 'react';
import { Table, Input, Button, Modal, Form, message, Switch, Tag } from 'antd';

export default function VendorTable({ token }) {
  const [vendors, setVendors] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editingData, setEditingData] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm] = Form.useForm();

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

  const fetchVendors = async () => {
    try {
      // fetch ALL so you can toggle inactive back to active
      const res = await fetch(`${API_URL}/vendors?active=all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch vendors');
      setVendors(json.vendors || []);
    } catch (err) {
      console.error('Failed to fetch vendors:', err);
      message.error('Failed to load vendors');
    }
  };

  useEffect(() => {
    fetchVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEditing = (vendor) => {
    setEditingId(vendor.vendor_id);
    setEditingData({ ...vendor });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingData({});
  };

  const handleEditChange = (field, value) => {
    setEditingData((prev) => ({ ...prev, [field]: value }));
  };

  const saveVendor = async () => {
    const { vendor_id, vendor_name, contact_email, contact_phone, address } = editingData;
    if (!vendor_name || vendor_name.trim() === '') {
      message.error('Vendor name is required');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/vendors/${vendor_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ vendor_name, contact_email, contact_phone, address }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update vendor');

      setVendors((prev) =>
        prev.map((v) => (v.vendor_id === vendor_id ? json.vendor : v))
      );
      cancelEditing();
      message.success('Vendor updated');
    } catch (err) {
      console.error('Error saving vendor:', err);
      message.error(err.message || 'Failed to update vendor');
    }
  };

  const removeVendor = async (vendor_id) => {
    try {
      const res = await fetch(`${API_URL}/vendors/${vendor_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete vendor');

      setVendors((prev) => prev.filter((v) => v.vendor_id !== vendor_id));
      message.success('Vendor deleted');
    } catch (err) {
      console.error(err);
      message.error('Failed to delete vendor');
    }
  };

  // Toggle active/inactive via PATCH is_active
  const toggleVendorStatus = async (vendor) => {
    const next = !vendor.is_active;
    try {
      const res = await fetch(`${API_URL}/vendors/${vendor.vendor_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_active: next }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update status');

      setVendors((prev) =>
        prev.map((v) => (v.vendor_id === vendor.vendor_id ? json.vendor : v))
      );
      message.success(`Vendor ${next ? 'activated' : 'deactivated'}`);
    } catch (err) {
      console.error(err);
      message.error(err.message || 'Failed to update status');
    }
  };

  const addVendor = async (formValues) => {
    const payload = {
      vendor_name: formValues.vendor_name?.trim(),
      contact_email: formValues.contact_email || null,
      contact_phone: formValues.contact_phone || null,
      address: formValues.address || null,
    };

    try {
      const res = await fetch(`${API_URL}/vendors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error creating vendor');

      setVendors((prev) => [...prev, json.vendor]);
      setShowAddForm(false);
      addForm.resetFields();
      message.success('Vendor added');
    } catch (err) {
      message.error(err.message || 'Failed to create vendor');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'vendor_id', width: 90, fixed: 'left' },
    {
      title: 'Name',
      dataIndex: 'vendor_name',
      width: 240,
      render: (_, vendor) =>
        editingId === vendor.vendor_id ? (
          <Input
            value={editingData.vendor_name}
            onChange={(e) => handleEditChange('vendor_name', e.target.value)}
          />
        ) : (
          vendor.vendor_name
        ),
    },
    {
      title: 'Email',
      dataIndex: 'contact_email',
      width: 220,
      render: (_, vendor) =>
        editingId === vendor.vendor_id ? (
          <Input
            value={editingData.contact_email}
            onChange={(e) => handleEditChange('contact_email', e.target.value)}
          />
        ) : (
          vendor.contact_email || '—'
        ),
    },
    {
      title: 'Phone',
      dataIndex: 'contact_phone',
      width: 160,
      render: (_, vendor) =>
        editingId === vendor.vendor_id ? (
          <Input
            value={editingData.contact_phone}
            onChange={(e) => handleEditChange('contact_phone', e.target.value)}
          />
        ) : (
          vendor.contact_phone || '—'
        ),
    },
    {
      title: 'Address',
      dataIndex: 'address',
      width: 280,
      render: (_, vendor) =>
        editingId === vendor.vendor_id ? (
          <Input
            value={editingData.address}
            onChange={(e) => handleEditChange('address', e.target.value)}
          />
        ) : (
          vendor.address || '—'
        ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      width: 150,
      align: 'center',
      render: (val, vendor) => (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
          <Tag color={vendor.is_active ? 'green' : 'red'}>
            {vendor.is_active ? 'Active' : 'Inactive'}
          </Tag>
          <Switch checked={!!vendor.is_active} onChange={() => toggleVendorStatus(vendor)} />
        </div>
      ),
    },
    {
      title: 'Actions',
      width: 220,
      fixed: 'right',
      render: (_, vendor) =>
        editingId === vendor.vendor_id ? (
          <>
            <Button type="primary" onClick={saveVendor} style={{ marginRight: 8 }}>
              Save
            </Button>
            <Button onClick={cancelEditing}>Cancel</Button>
          </>
        ) : (
          <>
            <Button onClick={() => startEditing(vendor)} style={{ marginRight: 8 }}>
              Edit
            </Button>
            <Button danger onClick={() => removeVendor(vendor.vendor_id)}>Delete</Button>
          </>
        ),
    },
  ];

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm w-full">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Vendors</h2>
        <Button type="primary" onClick={() => setShowAddForm(true)}>+ Add Vendor</Button>
      </div>

      <Table
        dataSource={vendors}
        columns={columns}
        rowKey="vendor_id"
        bordered
        size="middle"
        sticky
        pagination={{ pageSize: 10, showSizeChanger: true }}
        scroll={{ x: 1200 }}
        rowClassName={(record) => (record.is_active ? '' : 'opacity-60')}
      />

      <Modal
        open={showAddForm}
        title="Add New Vendor"
        onCancel={() => setShowAddForm(false)}
        footer={null}
      >
        <Form form={addForm} layout="vertical" onFinish={addVendor}>
          <Form.Item name="vendor_name" label="Vendor Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contact_email" label="Email">
            <Input />
          </Form.Item>
          <Form.Item name="contact_phone" label="Phone">
            <Input />
          </Form.Item>
          <Form.Item name="address" label="Address">
            <Input />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" style={{ marginRight: 8 }}>
              Save
            </Button>
            <Button onClick={() => setShowAddForm(false)}>Cancel</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
