const MOBILE_TEST_API_URL = 'https://sedate-obstruct-gathering.ngrok-free.dev/api';

const getApiBaseUrl = () => {
  const hostname = window.location.hostname;
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

  if (process.env.REACT_APP_API_URL) {
    // If env var is set but contains localhost, replace with current hostname for LAN access
    const envUrl = process.env.REACT_APP_API_URL;
    if (envUrl.includes('localhost') || envUrl.includes('127.0.0.1')) {
      // For mobile/LAN testing, use ngrok backend instead of invalid host:3001 mappings.
      if (!isLocalHost) {
        return MOBILE_TEST_API_URL;
      }
      return envUrl.replace(/localhost|127\.0\.0\.1/, hostname);
    }
    return envUrl;
  }

  if (!isLocalHost) {
    return MOBILE_TEST_API_URL;
  }

  // Default: use current hostname so it works on both localhost and LAN
  return `http://${hostname}:3001/api`;
};

const API_BASE_URL = getApiBaseUrl();

// Helper function to get auth token from localStorage
const getToken = () => {
  return localStorage.getItem('token');
};

// Helper function to set auth token in localStorage
const setToken = (token) => {
  localStorage.setItem('token', token);
};

// Helper function to remove auth token from localStorage
const removeToken = () => {
  localStorage.removeItem('token');
};

// Generic API request function
const apiRequest = async (endpoint, options = {}) => {
  console.log('API Request:', endpoint, options);
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  try {
    console.log('Fetching from:', `${API_BASE_URL}${endpoint}`);
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    console.log('Response status:', response.status);
    
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      throw new Error(response.ok ? 'Invalid response' : text || `Request failed (${response.status})`);
    }

    if (!response.ok) {
      // Prefer backend-provided error message when available
      const backendMessage = data && (data.error || data.message);
      throw new Error(backendMessage || `API Error: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

// Auth API
export const authAPI = {
  login: async (email, password) => {
    const data = await apiRequest('/users/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.token) {
      setToken(data.token);
    }
    return data;
  },

  register: async (name, email, password, role) => {
    const data = await apiRequest('/users', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role }),
    });
    return data;
  },

  getCurrentUser: async () => {
    return await apiRequest('/users/me');
  },

  logout: () => {
    removeToken();
  },

  changePassword: async (passwordData) => {
    return await apiRequest('/users/change-password', {
      method: 'POST',
      body: JSON.stringify(passwordData),
    });
  },
};

// Map API
export const mapAPI = {
  getFeatures: async () => {
    console.log('API: Getting map features');
    return await apiRequest('/map/features');
  },

  saveFeature: async (feature) => {
    return await apiRequest('/map/features', {
      method: 'POST',
      body: JSON.stringify(feature),
    });
  },

  createFeature: async (feature) => {
    return await apiRequest('/map/features/new', {
      method: 'POST',
      body: JSON.stringify(feature),
    });
  },

  deleteFeature: async (id, type) => {
    return await apiRequest(`/map/features/${id}?type=${type}`, {
      method: 'DELETE',
    });
  },

  setPin: async (id, type, geometry) => {
    return await apiRequest(`/map/features/${id}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ type, geometry }),
    });
  },

  removePin: async (id, type) => {
    return await apiRequest(`/map/features/${id}/pin?type=${type}`, {
      method: 'DELETE',
    });
  },
};

// Buildings API
export const buildingsAPI = {
  getAll: async () => {
    return await apiRequest('/buildings');
  },

  getByDepartment: async () => {
    return await apiRequest('/buildings/department/my');
  },

  getById: async (id) => {
    return await apiRequest(`/buildings/${id}`);
  },

  create: async (building) => {
    return await apiRequest('/buildings', {
      method: 'POST',
      body: JSON.stringify(building),
    });
  },

  update: async (id, building) => {
    return await apiRequest(`/buildings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(building),
    });
  },

  delete: async (id) => {
    return await apiRequest(`/buildings/${id}`, {
      method: 'DELETE',
    });
  },

  reactivate: async (id) => {
    return await apiRequest(`/buildings/${id}/reactivate`, {
      method: 'PUT',
    });
  },

  uploadImage: async (id, base64Data) => {
    return await apiRequest(`/buildings/${id}/image`, {
      method: 'POST',
      body: JSON.stringify({ image: base64Data }),
    });
  },

  deleteImage: async (id) => {
    return await apiRequest(`/buildings/${id}/image`, {
      method: 'DELETE',
    });
  },
};
export const roomsAPI = {
  getAll: async () => {
    return await apiRequest('/rooms');
  },

  getByDepartment: async () => {
    return await apiRequest('/rooms/department/my');
  },

  getByBuilding: async (buildingId) => {
    return await apiRequest(`/rooms/building/${buildingId}`);
  },

  getById: async (id) => {
    return await apiRequest(`/rooms/${id}`);
  },

  create: async (room) => {
    return await apiRequest('/rooms', {
      method: 'POST',
      body: JSON.stringify(room),
    });
  },

  update: async (id, room) => {
    return await apiRequest(`/rooms/${id}`, {
      method: 'PUT',
      body: JSON.stringify(room),
    });
  },

  delete: async (id) => {
    return await apiRequest(`/rooms/${id}`, {
      method: 'DELETE',
    });
  },

  reactivate: async (id) => {
    return await apiRequest(`/rooms/${id}/reactivate`, {
      method: 'PUT',
    });
  },
};

// Offices API
export const officesAPI = {
  getAll: async () => {
    return await apiRequest('/offices');
  },

  getByDepartment: async () => {
    return await apiRequest('/offices/department/my');
  },

  getById: async (id) => {
    return await apiRequest(`/offices/${id}`);
  },

  create: async (office) => {
    return await apiRequest('/offices', {
      method: 'POST',
      body: JSON.stringify(office),
    });
  },

  update: async (id, office) => {
    return await apiRequest(`/offices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(office),
    });
  },

  delete: async (id) => {
    return await apiRequest(`/offices/${id}`, {
      method: 'DELETE',
    });
  },

  reactivate: async (id) => {
    return await apiRequest(`/offices/${id}/reactivate`, {
      method: 'PUT',
    });
  },
};

// Faculty API
export const facultyAPI = {
  getAll: async () => {
    return await apiRequest('/faculty');
  },

  getByDepartment: async () => {
    return await apiRequest('/faculty/department/my');
  },

  getByOffice: async (officeId) => {
    return await apiRequest(`/faculty/office/${officeId}`);
  },

  getById: async (id) => {
    return await apiRequest(`/faculty/${id}`);
  },

  create: async (faculty) => {
    return await apiRequest('/faculty', {
      method: 'POST',
      body: JSON.stringify(faculty),
    });
  },

  update: async (id, faculty) => {
    return await apiRequest(`/faculty/${id}`, {
      method: 'PUT',
      body: JSON.stringify(faculty),
    });
  },

  delete: async (id) => {
    return await apiRequest(`/faculty/${id}`, {
      method: 'DELETE',
    });
  },

  reactivate: async (id) => {
    return await apiRequest(`/faculty/${id}/reactivate`, {
      method: 'PUT',
    });
  },
};

// Services API
export const servicesAPI = {
  getAll: async () => {
    return await apiRequest('/services');
  },

  getByOffice: async () => {
    return await apiRequest('/services/office/my');
  },

  getById: async (id) => {
    return await apiRequest(`/services/${id}`);
  },

  create: async (service) => {
    return await apiRequest('/services', {
      method: 'POST',
      body: JSON.stringify(service),
    });
  },

  update: async (id, service) => {
    return await apiRequest(`/services/${id}`, {
      method: 'PUT',
      body: JSON.stringify(service),
    });
  },

  delete: async (id) => {
    return await apiRequest(`/services/${id}`, {
      method: 'DELETE',
    });
  },

  reactivate: async (id) => {
    return await apiRequest(`/services/${id}/reactivate`, {
      method: 'PUT',
    });
  },
};

// Departments API
export const departmentsAPI = {
  getAll: async () => {
    return await apiRequest('/departments');
  },

  create: async (department) => {
    return await apiRequest('/departments', {
      method: 'POST',
      body: JSON.stringify(department),
    });
  },

  update: async (id, department) => {
    return await apiRequest(`/departments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(department),
    });
  },

  delete: async (id) => {
    return await apiRequest(`/departments/${id}`, {
      method: 'DELETE',
    });
  },

  reactivate: async (id) => {
    return await apiRequest(`/departments/${id}/reactivate`, {
      method: 'PUT',
    });
  },
};

// Settings API
export const settingsAPI = {
  get: async () => {
    return await apiRequest('/settings');
  },

  update: async (settings) => {
    return await apiRequest('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  // Public endpoint - no auth required
  getStatus: async () => {
    return await apiRequest('/settings/status');
  },
};

// Overview API
export const overviewAPI = {
  get: async () => {
    return await apiRequest('/overview');
  },
};

// Chat/Chatbot API
export const chatAPI = {
  sendMessage: async (message, language = 'en', selectedSuggestion = null, conversationHistory = []) => {
    return await apiRequest('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, language, selectedSuggestion, conversationHistory }),
    });
  },

  getSuggestions: async (partialQuery, language = 'en', limit = 5) => {
    const query = encodeURIComponent(String(partialQuery || ''));
    const lang = encodeURIComponent(String(language || 'en'));
    const cappedLimit = Math.max(1, Math.min(10, Number(limit) || 5));
    return await apiRequest(`/chat/suggestions?q=${query}&language=${lang}&limit=${cappedLimit}`);
  },

  logSuggestionSelection: async (partialQuery, suggestion) => {
    return await apiRequest('/chat/suggestions/select', {
      method: 'POST',
      body: JSON.stringify({
        partial_query: String(partialQuery || ''),
        selected_suggestion: suggestion || null,
      }),
    });
  },
};

// Popular locations API
export const popularAPI = {
  getPopular: async () => {
    return await apiRequest('/popular');
  },

  logLocation: async (locationId) => {
    return await apiRequest('/popular/log', {
      method: 'POST',
      body: JSON.stringify({ locationId }),
    });
  },
};

export { getToken, setToken, removeToken };
