import React, { useEffect, useState } from 'react';
import '../node_modules/antd/dist/reset.css';
import { Button, Input, Modal, Form, message, Switch } from 'antd';
import {
  Table as STable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './components/ui/table';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingData, setEditingData] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const token = localStorage.getItem('token');
  const [addForm] = Form.useForm();
  const [inactiveProducts, setInactiveProducts] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/products`)
      .then((res) => res.json())
      .then(({ products }) => setProducts(products))
      .catch((err) => console.error('Failed to load products', err));
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/products`)
      .then(res => res.json())
      .then(({ products }) => setProducts(products || []))
      .catch(err => console.error('Failed to load products', err));

    fetch(`${API_URL}/products/inactive`)
      .then(res => res.json())
      .then(({ products }) => setInactiveProducts(products || []))
      .catch(err => console.error('Failed to load inactive products', err));
  }, []);

  const toggleEditMode = () => {
    setEditMode(!editMode);
    setEditingProduct(null);
    setEditingData({});
    setShowAddForm(false);
  };

  const onEdit = (product) => {
    setEditingProduct(product);
    setEditingData({ ...product }); // includes is_active from backend
  };

  const onChangeField = (field, value) => {
    setEditingData((prev) => ({ ...prev, [field]: value }));
  };

  const onSave = async () => {
    try {
      const { product_id, ...updates } = editingData;
      const token = localStorage.getItem('token');

      const res = await fetch(`${API_URL}/products/${product_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const err = await res.json();
        message.error(`Update failed: ${err.error || 'Unknown error'}`);
        return;
      }

      const { product } = await res.json();

      // clear editing UI
      setEditingProduct(null);
      setEditingData({});

      if (product.is_active === false) {
        // move to inactive list
        setProducts(prev => prev.filter(p => p.product_id !== product.product_id));
        setInactiveProducts(prev => [product, ...prev]);
      } else {
        // normal in-place update
        setProducts(prev =>
          prev.map(p => (p.product_id === product.product_id ? product : p))
        );
      }

      message.success('Product updated');
    } catch (err) {
      console.error(err);
      message.error('Update failed');
    }
  };

  const activateProduct = async (p) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/products/${p.product_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_active: true }),
      });

      if (!res.ok) {
        const err = await res.json();
        message.error(`Activate failed: ${err.error || 'Unknown error'}`);
        return;
      }

      const { product } = await res.json();

      // move to active list
      setInactiveProducts(prev => prev.filter(i => i.product_id !== product.product_id));
      setProducts(prev => [product, ...prev]); // or insert sorted if you prefer

      message.success('Product activated');
    } catch (err) {
      console.error(err);
      message.error('Activate failed');
    }
  };


  const onRemove = async (id) => {
    try {
      const res = await fetch(`${API_URL}/products/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json();
        message.error(`Delete failed: ${err.error || 'Unknown error'}`);
        return;
      }

      setProducts(products.filter((p) => p.product_id !== id));
      message.success('Product removed');
    } catch (err) {
      console.error(err);
      message.error('Delete failed');
    }
  };

  const onAdd = async (values) => {
    try {
      const token = localStorage.getItem('token');

      const res = await fetch(`${API_URL}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...values,
          price: Number(values.price),
          stock: Number(values.stock),
          category_id: values.category_id
            ? Number(values.category_id)
            : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        message.error(`Create failed: ${err.error || 'Unknown error'}`);
        return;
      }

      const { product } = await res.json();
          setProducts([...products, product]);
          addForm.resetFields();
          setShowAddForm(false);
          message.success('Product added');
        } catch (err) {
          console.error(err);
          message.error('Create failed');
        }
      };

  const exportPdf = () => {
    const doc = new jsPDF();
    const tableColumn = ['ID', 'Name', 'SKU', 'Price', 'Active', 'Category ID'];
    const tableRows = products.map((p) => [
      p.product_id,
      p.product_name,
      p.sku,
      p.price,
      p.is_active ? 'Yes' : 'No',
      p.category_id ?? '',
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });

    doc.text('Products Report', 14, 15);
    doc.save('products_report.pdf');
  };

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm w-full">
      <Button onClick={toggleEditMode} type="default">
        {editMode ? 'Cancel' : 'Alter Products Chart'}
      </Button>
      <Button onClick={exportPdf} type="default" style={{ marginLeft: 8 }}>
        Export PDF
      </Button>
      {editMode && (
        <Button
          type="primary"
          onClick={() => setShowAddForm(true)}
          style={{ marginLeft: 8 }}
        >
          Add Product
        </Button>
      )}

      <div className="mt-4 overflow-x-auto">
        <STable className="min-w-full">
          <TableHeader className="sticky top-0 bg-gray-50">
            <TableRow>
              <TableHead className="w-[80px]">ID</TableHead>
              <TableHead className="min-w-[220px]">Name</TableHead>
              <TableHead className="min-w-[140px]">SKU</TableHead>
              <TableHead className="text-right w-[120px]">Price</TableHead>
              <TableHead className="text-right w-[120px]">Active</TableHead>
              <TableHead className="text-right w-[140px]">
                Category ID
              </TableHead>
              {editMode && (
                <TableHead className="text-right w-[220px]">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>

          <TableBody>
            {products.map((record) => {
              const editing =
                editingProduct?.product_id === record.product_id;

              return (
                <TableRow key={record.product_id}>
                  <TableCell className="font-mono text-sm">
                    {record.product_id}
                  </TableCell>

                  <TableCell>
                    {editing ? (
                      <Input
                        value={editingData.product_name}
                        onChange={(e) =>
                          onChangeField('product_name', e.target.value)
                        }
                      />
                    ) : (
                      record.product_name
                    )}
                  </TableCell>

                  <TableCell>
                    {editing ? (
                      <Input
                        value={editingData.sku}
                        onChange={(e) =>
                          onChangeField('sku', e.target.value)
                        }
                      />
                    ) : (
                      record.sku
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    {editing ? (
                      <Input
                        type="number"
                        value={editingData.price}
                        onChange={(e) =>
                          onChangeField('price', e.target.value)
                        }
                      />
                    ) : (
                      record.price
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    {editing ? (
                      <Switch
                        checked={!!editingData.is_active}
                        onChange={(checked) =>
                          onChangeField('is_active', checked)
                        }
                      />
                    ) : record.is_active ? (
                      'Yes'
                    ) : (
                      'No'
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    {editing ? (
                      <Input
                        type="number"
                        value={editingData.category_id}
                        onChange={(e) =>
                          onChangeField('category_id', e.target.value)
                        }
                      />
                    ) : (
                      record.category_id
                    )}
                  </TableCell>

                  {editMode && (
                    <TableCell className="text-right">
                      {editing ? (
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            justifyContent: 'flex-end',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Button type="primary" onClick={onSave}>
                            Save
                          </Button>
                          <Button onClick={() => setEditingProduct(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            justifyContent: 'flex-end',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Button onClick={() => onEdit(record)}>Edit</Button>
                          <Button
                            danger
                            onClick={() => onRemove(record.product_id)}
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </STable>
      </div>

      {/* Deactivated products table */}
      <div className="mt-10">
        <h3 className="text-lg font-semibold mb-3">Deactivated Products</h3>
        <div className="overflow-x-auto">
          <STable className="min-w-full">
            <TableHeader className="sticky top-0 bg-gray-50">
              <TableRow>
                <TableHead className="w-[80px]">ID</TableHead>
                <TableHead className="min-w-[220px]">Name</TableHead>
                <TableHead className="min-w-[140px]">SKU</TableHead>
                <TableHead className="text-right w-[120px]">Price</TableHead>
                <TableHead className="text-right w-[140px]">Category ID</TableHead>
                <TableHead className="text-right w-[200px]">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {inactiveProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-gray-500">
                    No deactivated products
                  </TableCell>
                </TableRow>
              ) : (
                inactiveProducts.map((record) => (
                  <TableRow key={record.product_id}>
                    <TableCell className="font-mono text-sm">{record.product_id}</TableCell>
                    <TableCell>{record.product_name}</TableCell>
                    <TableCell>{record.sku}</TableCell>
                    <TableCell className="text-right">{record.price}</TableCell>
                    <TableCell className="text-right">{record.category_id}</TableCell>
                    <TableCell className="text-right">
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                        <Button type="primary" onClick={() => activateProduct(record)}>
                          Activate
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </STable>
        </div>
      </div>
      

      <Modal
        open={showAddForm}
        title="Add New Product"
        onCancel={() => setShowAddForm(false)}
        footer={null}
      >
        <Form form={addForm} layout="vertical" onFinish={onAdd}>
          <Form.Item
            name="product_name"
            label="Product Name"
            rules={[{ required: true, message: 'Product name is required' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="sku"
            label="SKU"
            rules={[{ required: true, message: 'SKU is required' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="price"
            label="Price"
            rules={[{ required: true, message: 'Price is required' }]}
          >
            <Input type="number" />
          </Form.Item>

          <Form.Item
            name="stock"
            label="Stock"
            rules={[{ required: true, message: 'Stock is required' }]}
          >
            <Input type="number" />
          </Form.Item>

          <Form.Item name="category_id" label="Category ID">
            <Input type="number" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" style={{ marginRight: 8 }}>
              Add Product
            </Button>
            <Button onClick={() => setShowAddForm(false)}>Cancel</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
