import React, { useState , useEffect } from 'react';
import RevenueChart from './RevenueChart';
import './App.css';
import UserTable from './UserTable';
import ProductsPage from './ProductsPage';
import StockDistributionChart from './StockDistributionChart';
import TotalInventoryWorthCard from './TotalInventoryWorthCard'; 
import InventoryTable from './InventoryTable';
import VendorTable from './VendorTable';
import LoginPage from './LoginPage';
import ProfileTab from './ProfileTab';
import RevenueInsightsCard from './RevenueInsightsCard';
import { message } from 'antd';
import OrdersDeliveriesPage from "./OrdersDeliveriesPage";

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

function App() {
  const [token, setToken] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('Login');
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sqlQuery, setSqlQuery] = useState('');
  const [totalSales, setTotalSales] = useState(0);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDesignation, setNewDesignation] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [editingUserId, setEditingUserId] = useState(null)
  const [editingData, setEditingData] = useState({})
  const thStyle = { border: '1px solid #ccc', padding: '8px', textAlign: 'left' };
  const tdStyle = { border: '1px solid #ccc', padding: '8px' };
  const [showPassword, setShowPassword] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showSql, setShowSql] = useState(false)
  const [totalInventoryWorth, setTotalInventoryWorth] = useState(0);

  const LOW_STOCK_THRESHOLD = 5;
  const [lowStock, setLowStock] = useState([]);

  const avatarUrl = currentUser
  ? `https://ui-avatars.com/api/?name=${currentUser.first_name}+${currentUser.last_name}&background=007bff&color=fff`
  : '';

  const cardStyle = {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
    padding: '20px',
    marginBottom: '20px'
  };


  function handleLoginSuccess(token, user) {
    setToken(token);
    setCurrentUser(user);
    setActiveTab('Dashboard'); // 👈 jump to Dashboard after login

    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  }

  function handleLogout() {
    // clear React state + localStorage
    setToken('');
    setCurrentUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  function startEditing(user) {
    setEditingUserId(user.user_id);
    setShowPassword(false);   
    setEditingData({
      user_id:       user.user_id,
      first_name:    user.first_name,
      last_name:     user.last_name,
      email:         user.email,
      designation:   user.designation || '',
      plainPassword: ''
    });
  }

  function cancelEditing() {
    setEditingUserId(null);
    setShowPassword(false); 
    setEditingData({});
  }

  function handleEditChange(field, value) {
    setEditingData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  async function saveUser() {
    const {
      user_id,
      first_name,
      last_name,
      email,
      designation,
      plainPassword
    } = editingData

    const body = {
      first_name,
      last_name,
      email,
      designation
    }

    if (plainPassword) {
      body.plainPassword = plainPassword
    }
    if (user_id !== editingUserId) {
      body.user_id = user_id
    }

    const res = await fetch(`${API_URL}/users/${editingUserId}`, {
      method:  'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` // ← add this
      },
      body: JSON.stringify(body)
    });


    let json = {};
    try {
      json = await res.json();
    } catch (err) {
      // Handle non-JSON or empty responses
      console.error('Failed to parse JSON:', err);
      alert('Unexpected server response. Please try again.');
      return;
    }

    if (!res.ok) {
      alert('Error updating user: ' + (json.error || json.message || 'Unknown error'));
      return;
    }

    setUsers(users.map(u =>
      u.user_id === editingUserId ? json.user : u
    ))
    cancelEditing()
  }


  useEffect(() => {
    if (activeTab === 'Products') {
      fetch(`${API_URL}/products`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(json => setProducts(json.products || []))
        .catch(err => console.error('Could not load products', err));
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'Users') {
      fetch(`${API_URL}/users`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`    // ← make sure you include your JWT here
        }
      })
        .then(res => {
          if (!res.ok) {
            console.error('Failed to fetch users:', res.status, res.statusText);
            return { users: [] };
          }
          return res.json();
        })
        .then(json => {
          console.log('Users response:', json);  // ← helps you debug what you got back
          setUsers(json.users || []);
        })
        .catch(err => console.error('Could not load users', err));
    }
  }, [activeTab, token]);

  const handleAsk = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();

      if (data.error) {
        setResponse({ error: data.error });
      } else {
        setResponse({ result: data.result });
        setSqlQuery(data.sqlQuery || '');
      }

      console.log('Response from server:', data);
    } catch (err) {
      setResponse({ error: 'Error connecting to server or AI' });
    }
    setLoading(false);
  };

  async function handleLogin() {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail, password: newPassword })
    });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error || 'Login failed');
      return;
    }
    setToken(json.token);
    setCurrentUser(json.user);
    localStorage.setItem('token', json.token);
    localStorage.setItem('user', JSON.stringify(json.user));
    // clear login fields
    setNewEmail('');
    setNewPassword('');
  }


  function formatResultSentence() {
    if (!response || !response.result) return '';

    const result = response.result;

    // Case: Single object with key-value pairs
    if (Array.isArray(result) && result.length === 1 && typeof result[0] === 'object') {
      const sentence = Object.entries(result[0])
        .map(([key, value]) => {
          // Capitalize the key and handle numbers nicely
          const formattedValue =
            typeof value === 'number'
              ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
              : value;
          return `The ${key.replace(/_/g, ' ')} is ${formattedValue}`;
        })
        .join('. ') + '.';
      return sentence;
    }

    // Case: single string or number
    if (typeof result === 'string') return result;
    if (typeof result === 'number')
      return `The result is ${result.toLocaleString()}.`;

    return 'No meaningful summary could be generated.';
  }



  const formatValue = (value, key) => {
    if (typeof value === 'string' && key.toLowerCase().includes('date')) {
      const d = new Date(value);
      if (!isNaN(d)) {
        return d.toLocaleString(); // full date + time
      }
    }

    // Only apply dollar formatting to known monetary fields
    if (typeof value === 'number' && ['total', 'total_revenue', 'avg_sales'].includes(key.toLowerCase())) {
      return `$${value.toFixed(2)}`;
    }

    return value;
  };

  // State to hold the selected date (defaulting to today)
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  // Whenever the date changes, re-fetch that day’s sales
  useEffect(() => {
    fetch(`${API_URL}/sales?date=${selectedDate}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setTotalSales(d.totalSales || 0))
      .catch(console.error);
  }, [selectedDate]);

  // Add user
  const addUser = async (formValues) => {
  const { first_name, last_name, email, designation, plainPassword } = formValues;

  try {
    const res = await fetch(`${API_URL}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        first_name,
        last_name,
        email,
        designation,
        plainPassword
      })
    });

    const json = await res.json();
    if (!res.ok) {
      message.error('Error creating user: ' + (json.error || json.message));
      return;
    }

    setUsers([...users, json.user]);
    message.success('User added');
  } catch (err) {
      message.error('Server error creating user');
      console.error(err);
    }
  };


  // Update designation
  const updateDesignation = async (userId, designation) => {
    const res = await fetch(`${API_URL}/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ designation })
    });
    const json = await res.json();
    if (!res.ok) {
      alert('Error updating: ' + (json.error || json.message));
      return;
    }
    setUsers(users.map(u => u.user_id === userId ? json.user : u));
  };

  // Delete user
  const removeUser = async (userId) => {
    await fetch(`${API_URL}/users/${userId}`, { method: 'DELETE' });
    setUsers(users.filter(u => u.user_id !== userId));
  };

  const fetchUsers = () => {
    fetch(`${API_URL}/users`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r=>r.json())
      .then(j=>setUsers(j.users))
      .catch(console.error);
  };

  function UserAvatar({ user }) {
    const initials = (
      (user?.first_name?.[0] || '') + (user?.last_name?.[0] || '')
    ).toUpperCase();

    return (
      <div className="h-9 w-9 rounded-full overflow-hidden bg-muted flex items-center justify-center text-sm font-medium">
        {user?.avatar_url ? (
          <img src={user.avatar_url} alt="avatar" className="h-full w-full object-cover" />
        ) : (
          <span>{initials || '👤'}</span>
        )}
      </div>
    );
  }


  useEffect(() => {
    if (activeTab==='Users') fetchUsers();
  }, [activeTab]);

  const updatePrivilege = async (userId, newRole) => {
    try {
      const res = await fetch(`${API_URL}/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ role_id: newRole })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error||json.detail);
      alert('Privilege updated successfully');
      fetchUsers();  // auto-refresh
    } catch (err) {
      alert('Failed to update privilege: ' + err.message);
    }
  };

  console.log('currentUser in render:', currentUser);

  useEffect(() => {
    if (activeTab !== 'Dashboard') return;

    fetch(`${API_URL}/products`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(json => {
        const list = (json.products || json || [])
          .filter(p => {
            const s = Number(p.stock ?? p.quantity ?? 0);
            return !Number.isNaN(s) && s <= LOW_STOCK_THRESHOLD;
          })
          .sort((a, b) => (Number(a.stock ?? 0) - Number(b.stock ?? 0)));
        setLowStock(list);
      })
      .catch(err => console.error('Could not load low-stock products', err));
  }, [activeTab, token]);

  useEffect(() => {
    if (activeTab !== 'Dashboard') return;

    fetch(`${API_URL}/inventory/worth`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(j => setTotalInventoryWorth(Number(j.totalWorth || 0)))
      .catch(err => console.error('Failed to load inventory worth:', err));
  }, [activeTab, token]);



  if (!currentUser) {
    return <LoginPage API_URL={API_URL} onLogin={handleLoginSuccess} />;
  }

  return (
    <div className="App">

      {/* Top header */}
      <header style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#111',
        color: 'white',
        padding: '10px 20px',
        fontSize: '1.5rem',
      }}>
        <div>Envoy Inventory</div>
      </header>

      {/* Sidebar */}
      <div className="sidebar">
        <ul>
          <li
            onClick={() => setActiveTab('Dashboard')}
            className={activeTab === 'Dashboard' ? 'active' : ''}
          >
            Dashboard
          </li>
          <li
            onClick={() => setActiveTab('Products')}
            className={activeTab === 'Products' ? 'active' : ''}
          >
            Products
          </li>
          <li
            onClick={() => setActiveTab('Inventory')}
            className={activeTab === 'Inventory' ? 'active' : ''}
          >
            Inventory
          </li>
          <li
            onClick={() => setActiveTab('Users')}
            className={activeTab === 'Users' ? 'active' : ''}
          >
            Users
          </li>
          <li
            onClick={() => setActiveTab('Settings')}
            className={activeTab === 'Settings' ? 'active' : ''}
          >
            Settings
          </li>
          <li
            onClick={() => setActiveTab('Vendors & Orders')}
            className={activeTab === 'Vendors & Orders' ? 'active' : ''}
          >
            Vendors & Orders
          </li>
          <li
            onClick={() => setActiveTab('Orders & Deliveries')}
            className={activeTab === 'Orders & Deliveries' ? 'active' : ''}>
            Orders & Deliveries
          </li>
          <li
            onClick={() => setActiveTab('Profile')}
            className={activeTab === 'Profile' ? 'active' : ''}
            style={{
              paddingLeft: '3.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {/* Replace <img> with UserAvatar */}
            <UserAvatar user={currentUser} />
            Profile
          </li>
        </ul>
      </div>

      {/* Main content area */}
      <div className="ml-56 mt-16 p-6 max-w-screen-xl mx-auto">

        {/* DASHBOARD TAB */}
        {activeTab === 'Dashboard' && (
        <div className="px-6 py-6 max-w-screen-2xl mx-auto">
          <div className="grid gap-6 grid-cols-1 md:grid-cols-6 xl:grid-cols-12 auto-rows-auto items-start">

            {/* Sales */}
            <div className="col-span-1 md:col-span-3 xl:col-span-3 xl:row-start-1 flex flex-col gap-6">
              <div className="rounded-2xl border bg-white shadow-sm p-6 min-h-[220px]">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-600">
                    Sales for
                  </div>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="rounded-md border px-3 py-1.5 text-sm bg-white"
                  />
                </div>
                <div className="mt-4 font-semibold text-[clamp(2.5rem,6vw,4.5rem)] tabular-nums text-gray-900">
                  ${totalSales}
                </div>
              </div>

              <TotalInventoryWorthCard worth={totalInventoryWorth} />
            </div>


            {/* Stock (same height as Revenue) */}
            <div className="col-span-1 md:col-span-3 xl:col-span-4 xl:row-start-1 xl:h-[380px]">
              <StockDistributionChart />
            </div>

            {/* Monthly Revenue (chart only, no Card inside) */}
            <div className="rounded-2xl border bg-white shadow-sm p-6 col-span-1 md:col-span-6 xl:col-start-8 xl:col-span-5 xl:row-start-1 xl:h-[380px] flex flex-col">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Monthly Revenue</h3>
              <div className="mt-3 flex-1 min-h-0">
                <RevenueChart />
              </div>
            </div>

            {/* Worth under Sales */}
            {/* <div className="col-span-1 md:col-span-3 xl:col-span-3 xl:row-start-2">
              <TotalInventoryWorthCard worth={totalInventoryWorth} />
            </div> */}

            {/* Insights under Revenue */}
            <div className="col-span-1 md:col-span-6 xl:col-start-8 xl:col-span-5 xl:row-start-2">
              <RevenueInsightsCard />
            </div>

            {/* Low Stock Products */}
            <div className="col-span-1 md:col-span-6 xl:col-start-1 xl:col-span-7 xl:row-start-2">
              <div className="rounded-2xl border bg-white shadow-sm p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                    Low Stock ({lowStock.length})
                  </h3>
                  <button
                    onClick={() => setActiveTab('Inventory')}
                    className="rounded-md px-4 py-2 text-sm font-medium text-white bg-[#4B5043]"
                  >
                    Restock
                  </button>
                </div>

                {lowStock.length === 0 ? (
                  <p className="mt-3 text-sm text-gray-600">
                    All stocked up. No items at or below {LOW_STOCK_THRESHOLD}.
                  </p>
                ) : (
                  <ul className="mt-4 divide-y">
                    {lowStock.slice(0, 8).map(p => (
                      <li key={p.product_id} className="py-2 flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{p.product_name}</div>
                          {p.sku && <div className="text-xs text-gray-500 truncate">SKU {p.sku}</div>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">In stock</span>
                          <span className="rounded-md bg-red-50 text-red-700 text-xs px-2 py-1">
                            {p.stock}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>


            {/* AI under Insights */}
            <div className="col-span-1 md:col-span-6 xl:col-start-1 xl:col-span-12">
              <div className="mx-auto w-full max-w-4xl rounded-2xl border bg-white p-6 shadow-sm overflow-hidden">
                  <h2 className="mb-4 text-center text-lg font-semibold">Envoy AI</h2>

                    <div className="mb-4 flex w-full items-center gap-3">
                      <input
                        type="text"
                        value={question}
                        onChange={e => setQuestion(e.target.value)}
                        placeholder="Ask a question like: Total revenue last month"
                        className="w-full rounded-md border px-4 py-3 text-base"
                      />
                      <button
                        onClick={handleAsk}
                        disabled={loading}
                        className="shrink-0 rounded-md px-5 py-3 text-sm font-medium text-white bg-[#4B5043]"
                      >
                        {loading ? 'Thinking...' : 'Ask AI'}
                      </button>
                      <button
                        onClick={() => setShowSql(v => !v)}
                        className="shrink-0 rounded-md px-5 py-3 text-sm font-medium bg-gray-200"
                      >
                        {showSql ? 'Hide SQL' : 'Show SQL'}
                      </button>
                    </div>

                    {response?.error && (
                      <div className="mb-4 text-red-600">
                        <h3 className="font-semibold">Error:</h3>
                        <p>{response.error}</p>
                      </div>
                    )}

                    {showSql && sqlQuery && (
                      <>
                        <h3 className="font-semibold">SQL Query Generated:</h3>
                        <pre className="mt-2 overflow-x-auto rounded-md bg-gray-100 p-3">{sqlQuery}</pre>
                      </>
                    )}

                    {response && (
                      <>
                        <h3 className="mt-4 font-semibold">Result:</h3>
                        {Array.isArray(response.result) && (
                          response.result.length > 1 ||
                          (response.result.length === 1 && Object.keys(response.result[0]).length > 1)
                        ) ? (
                          <div className="mt-3 w-full overflow-x-auto">
                            <table className="min-w-full table-auto border-separate border-spacing-0">
                              <thead className="bg-gray-100">
                                <tr>
                                  {Object.keys(response.result[0]).map(key => (
                                    <th
                                      key={key}
                                      className="border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide"
                                    >
                                      {key.toUpperCase()}
                                    </th>
                                  ))}
                                </tr>
                              </thead>

                              <tbody>
                                {response.result.map((row, idx) => (
                                  <tr key={idx}>
                                    {Object.entries(row).map(([k, v]) => (
                                      <td key={k} className="border px-3 py-2">
                                        {formatValue(v, k)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                        ) : (
                          <p style={{ fontSize: '18px', marginTop: '1rem' }}>{formatResultSentence()}</p>
                        )}
                      </>
                    )}
                </div>
              </div>
            </div>
          </div>
        )}


        {/* PRODUCTS TAB */}
        {activeTab === 'Products' && (
          <div style={{ padding: '2rem' }}>
            <ProductsPage />
          </div>
        )}

        {/* INVENTORY TAB */}
        {activeTab === 'Inventory' && (
          <div>
            <InventoryTable currentUser={currentUser} token={token} />
          </div>
        )}


        {/* USERS TAB */}
        {activeTab === 'Users' && (
          <div>
            <h2>Users</h2>
            <UserTable
              users={users}
              currentUser={currentUser}
              editingUserId={editingUserId}
              editingData={editingData}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              startEditing={startEditing}
              cancelEditing={cancelEditing}
              handleEditChange={handleEditChange}
              updatePrivilege={updatePrivilege}
              saveUser={saveUser}
              removeUser={removeUser}
              addUser={addUser}
            />
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'Settings' && (
          <div>
            <h2>Settings</h2>
          </div>
        )}
        {/* ORDERS TAB */}
        {activeTab === 'Vendors & Orders' && (
          <div>
            <VendorTable token={token} />
          </div>
        )}

        {/* ORDERS & DELIVERIES TAB */}
        {activeTab === 'Orders & Deliveries' && (
          <div>
            <OrdersDeliveriesPage token={token} />
          </div>
        )}


        {/* PROFILE TAB */}
        {activeTab === 'Profile' && (
          <ProfileTab token={token} onUserUpdate={setCurrentUser} onLogout={handleLogout} />
        )}

      </div>
    </div>
  );


}

export default App;
