import React, { useState } from 'react';   
import { Table, Input, Button, Select, Tag, Modal, Form, message } from 'antd';
const { Option } = Select;

export default function UserTable({
  users,
  currentUser,
  editingUserId,
  editingData,
  showPassword,
  setShowPassword,
  startEditing,
  cancelEditing,
  handleEditChange,
  updatePrivilege,
  saveUser,
  removeUser,
  addUser
}) {
    const [showAddForm, setShowAddForm] = useState(false);
    const [addForm] = Form.useForm();
    const columns = [
      {
        title: 'ID',
        dataIndex: 'user_id',
        width: 80,
        render: (_, user) =>
          editingUserId === user.user_id ? (
            <Input
              type="number"
              value={editingData.user_id}
              onChange={e => handleEditChange('user_id', parseInt(e.target.value))}
            />
          ) : (
            user.user_id
          ),
      },
      {
        title: 'Name',
        width: 220,
        render: (_, user) =>
          editingUserId === user.user_id ? (
            <>
              <Input
                placeholder="First"
                value={editingData.first_name}
                onChange={e => handleEditChange('first_name', e.target.value)}
                style={{ width: '48%', marginRight: '4%' }}
              />
              <Input
                placeholder="Last"
                value={editingData.last_name}
                onChange={e => handleEditChange('last_name', e.target.value)}
                style={{ width: '48%' }}
              />
            </>
          ) : (
            `${user.first_name} ${user.last_name}`
          ),
      },
      {
        title: 'Email',
        dataIndex: 'email',
        width: 260,
        ellipsis: true,
        render: (_, user) =>
          editingUserId === user.user_id ? (
            <Input
              type="email"
              value={editingData.email}
              onChange={e => handleEditChange('email', e.target.value)}
            />
          ) : (
            user.email
          ),
      },
      {
        title: 'Designation',
        dataIndex: 'designation',
        width: 260,
        ellipsis: true,
        render: (_, user) =>
          editingUserId === user.user_id ? (
            <Input
              value={editingData.designation}
              onChange={e => handleEditChange('designation', e.target.value)}
            />
          ) : (
            user.designation
          ),
      },
      currentUser.role_id !== 1 && {
        title: 'Password',
        width: 140,
        render: (_, user) =>
          editingUserId === user.user_id ? (
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="New password"
                value={editingData.plainPassword}
                onChange={e => handleEditChange('plainPassword', e.target.value)}
                style={{ paddingRight: '2rem' }}
              />
              <span
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                {showPassword ? '🙈' : '👁️'}
              </span>
            </div>
          ) : (
            '••••••••'
          ),
      },
      currentUser.role_id >= 2 && {
        title: 'Privilege',
        width: 150,
        render: (_, user) => {
          if (editingUserId === user.user_id) {
            if (currentUser.role_id === 3) {
              return (
                <Select
                  value={user.role_id}
                  onChange={val => updatePrivilege(user.user_id, val)}
                  style={{ width: 140 }}
                >
                  <Option value={1}>User</Option>
                  <Option value={2}>Manager</Option>
                  <Option value={3}>Administrator</Option>
                </Select>
              );
            } else {
              return user.role_id === 3 ? (
                <Tag color="red">Administrator</Tag>
              ) : (
                <Select
                  value={user.role_id}
                  onChange={val => updatePrivilege(user.user_id, val)}
                  style={{ width: 140 }}
                >
                  <Option value={1}>User</Option>
                  <Option value={2}>Manager</Option>
                </Select>
              );
            }
          } else {
            return (
              <Tag
                color={
                  user.role_id === 3
                    ? 'red'
                    : user.role_id === 2
                    ? 'blue'
                    : 'gray'
                }
              >
                {user.role_id === 3
                  ? 'Administrator'
                  : user.role_id === 2
                  ? 'Manager'
                  : 'User'}
              </Tag>
            );
          }
        },
      },
      currentUser.role_id >= 2 && {
       title: 'Actions',
      width: 200,
      fixed: 'right',
      render: (_, user) =>
        editingUserId === user.user_id ? (
          <div
            style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end',
              whiteSpace: 'nowrap',
            }}
          >
            <Button type="primary" onClick={saveUser}>
              Save
            </Button>
            <Button onClick={cancelEditing}>Cancel</Button>
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
            <Button onClick={() => startEditing(user)}>Edit</Button>
            <Button danger onClick={() => removeUser(user.user_id)}>
              Delete
            </Button>
          </div>
        ),
      },
    ].filter(Boolean);


return (
  <div className="rounded-2xl border bg-white p-6 shadow-sm w-full">
    <div className="flex items-center justify-between mb-4">
      {currentUser.role_id >= 2 && (
        <Button type="primary" onClick={() => setShowAddForm(true)}>
          + Add User
        </Button>
      )}
    </div>

    <Table
      dataSource={users}
      columns={columns}
      rowKey="user_id"
      bordered
      size="middle"
      sticky
      tableLayout="fixed"
      scroll={{ x: true }}
      pagination={{
        pageSize: 10,
        showSizeChanger: true,
        showTotal: t => `${t} users`,
      }}
    />

    <Modal
      open={showAddForm}
      title="Create New User"
      onCancel={() => setShowAddForm(false)}
      footer={null}
      width={520}
    >
      <Form form={addForm} onFinish={addUser}>
        <Form.Item name="first_name" label="First Name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="last_name" label="Last Name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="designation" label="Designation">
          <Input />
        </Form.Item>
        <Form.Item name="plainPassword" label="Password" rules={[{ required: true }]}>
          <Input.Password />
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
