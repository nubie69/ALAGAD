import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMapState } from '../context/MapContext';
import { useAuth } from '../context/AuthContext';
import { buildingsAPI, roomsAPI, officesAPI, facultyAPI, servicesAPI, faqsAPI, resourcesAPI, departmentsAPI, settingsAPI, overviewAPI, authAPI } from '../utils/api';
import './SuperAdminDashboard.css';
import MapEditor from '../components/MapEditor';
import SearchableSelect from '../components/SearchableSelect';
import {
  CUSTOM_POSITION_VALUE,
  PERSONNEL_POSITION_GROUPS,
  findPositionByLabel,
  findPositionByValue,
} from '../constants/personnelPositions';
import {
  EditIcon,
  DeleteIcon,
  DashboardIcon,
  BuildingIcon,
  DepartmentIcon,
  StaffIcon,
  RoomIcon,
  OfficeIcon,
  ServiceIcon,
  MapIconOutline,
  SettingsIcon,
  MapPinIconOutline,
} from '../utils/icons';

const AVAILABILITY_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const RESOURCE_TYPES = ['PDF', 'DOC', 'DOCX', 'FORM', 'REQUIREMENTS', 'GUIDE', 'OFFICIAL WEBSITE', 'OTHER'];
const STAKEHOLDER_OPTIONS = [
  { value: 'student', label: 'Students' },
  { value: 'faculty', label: 'Faculty' },
  { value: 'staff', label: 'Staff' },
  { value: 'visitor', label: 'Visitors' },
  { value: 'applicant', label: 'Applicants' },
  { value: 'parent_guardian', label: 'Parents/Guardians' },
  { value: 'alumni', label: 'Alumni' },
  { value: 'other', label: 'Other' },
];
const DEFAULT_AVAILABILITY_TIME_SLOT = '8:00 AM – 5:00 PM';

const ORGANIZATIONAL_CHART_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];
const MAX_ORGANIZATIONAL_CHART_BYTES = 5 * 1024 * 1024;

function OrganizationalChartUpload({ formData, setFormData, onError, inputId }) {
  const pendingData = formData._organizationalChartData;
  const existingChart = formData._removeOrganizationalChart ? null : formData.organizationalChart;
  const previewData = pendingData || existingChart?.data;
  const previewMimeType = formData._organizationalChartMimeType || existingChart?.mimeType || '';
  const previewFileName = formData._organizationalChartFileName || existingChart?.fileName || '';

  const selectFile = (file) => {
    if (!file) return;
    if (!ORGANIZATIONAL_CHART_TYPES.includes(file.type)) {
      onError('Only PNG, JPG/JPEG, and PDF organizational charts are supported.');
      return;
    }
    if (file.size > MAX_ORGANIZATIONAL_CHART_BYTES) {
      onError('Organizational chart files must be 5 MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData((current) => ({
        ...current,
        _organizationalChartData: event.target.result,
        _organizationalChartFileName: file.name,
        _organizationalChartMimeType: file.type,
        _removeOrganizationalChart: false,
      }));
    };
    reader.onerror = () => onError('The organizational chart could not be read. Please try another file.');
    reader.readAsDataURL(file);
  };

  const removeChart = () => {
    setFormData((current) => ({
      ...current,
      _organizationalChartData: null,
      _organizationalChartFileName: '',
      _organizationalChartMimeType: '',
      _removeOrganizationalChart: Boolean(current.organizationalChart?.data),
    }));
  };

  return (
    <div className="form-section-card">
      <h3 className="form-section-title">Organizational Chart</h3>
      <p className="form-section-description">Upload the official chart for this office or department.</p>
      <div className="organizational-chart-upload">
        {previewData ? (
          <div className="organizational-chart-admin-preview">
            {previewMimeType === 'application/pdf' ? (
              <object data={previewData} type="application/pdf" aria-label="Organizational chart PDF preview">
                <p>PDF preview is unavailable in this browser.</p>
              </object>
            ) : (
              <img src={previewData} alt="Organizational chart preview" />
            )}
            <div className="organizational-chart-admin-file">
              <span>{previewFileName || 'Organizational chart'}</span>
              <button type="button" className="btn-danger-outline" onClick={removeChart}>Remove</button>
            </div>
          </div>
        ) : (
          <div className="organizational-chart-upload-empty">
            <span>No organizational chart uploaded.</span>
          </div>
        )}

        <input
          id={inputId}
          className="organizational-chart-file-input"
          type="file"
          accept="image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf"
          onChange={(event) => {
            selectFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <label className="btn-secondary organizational-chart-upload-button" htmlFor={inputId}>
          {previewData ? 'Replace Organizational Chart' : 'Upload Organizational Chart'}
        </label>
        <span className="form-label-hint">PNG, JPG/JPEG, or PDF (max 5 MB)</span>
      </div>
    </div>
  );
}

function SuperAdminDashboard() {
  const { mapFeatures, refreshMapFeatures } = useMapState();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [settingsSection, setSettingsSection] = useState('general');
  const [buildings, setBuildings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [offices, setOffices] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [services, setServices] = useState([]);
  const [faqs, setFaqs] = useState([]);
  const [resources, setResources] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [overviewStats, setOverviewStats] = useState({
    counts: {
      buildings: 0,
      rooms: 0,
      offices: 0,
      faculty: 0,
      services: 0,
      departments: 0,
    },
    topBuildings: [],
    kioskStatus: 'unknown',
    maintenanceMode: false,
  });
  const [facultySearch, setFacultySearch] = useState('');
  const [facultyDepartmentFilter, setFacultyDepartmentFilter] = useState('');
  const [facultyStatusFilter, setFacultyStatusFilter] = useState('');
  const [buildingSearch, setBuildingSearch] = useState('');
  const [buildingDepartmentFilter, setBuildingDepartmentFilter] = useState('');
  const [buildingStatusFilter, setBuildingStatusFilter] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const [roomStatusFilter, setRoomStatusFilter] = useState('');
  const [officeSearch, setOfficeSearch] = useState('');
  const [officeStatusFilter, setOfficeStatusFilter] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceDepartmentFilter, setServiceDepartmentFilter] = useState('');
  const [serviceStatusFilter, setServiceStatusFilter] = useState('');
  const [faqSearch, setFaqSearch] = useState('');
  const [faqOfficeFilter, setFaqOfficeFilter] = useState('');
  const resourceSearch = '';
  const resourceTypeFilter = '';
  const resourceStatusFilter = '';
  const [departmentSearch, setDepartmentSearch] = useState('');
  const [departmentStatusFilter, setDepartmentStatusFilter] = useState('');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    department: '',
    office: '',
  });
  const [formErrors, setFormErrors] = useState({});

  // Show notification with auto-hide
  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 4000);
  };

  // Helper function to convert floor number to ordinal format
  const getOrdinalFloor = (floor) => {
    if (!floor) return '-';
    const floorNum = parseInt(floor);
    const suffix = ['th', 'st', 'nd', 'rd'][floorNum % 10] || 'th';
    const suffix2 = floorNum % 100 >= 11 && floorNum % 100 <= 13 ? 'th' : suffix;
    return `${floorNum}${suffix2} Floor`;
  };

  const normalizeAvailabilityDays = (days) => {
    if (!Array.isArray(days)) return [];
    const daySet = new Set(
      days
        .map((day) => String(day || '').trim())
        .filter((day) => AVAILABILITY_DAYS.includes(day))
    );
    return AVAILABILITY_DAYS.filter((day) => daySet.has(day));
  };

  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchOverview();
    } else {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    fetchDepartments();
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDepartments = async () => {
    try {
      const departmentsData = await departmentsAPI.getAll();
      console.log('Departments data received:', departmentsData);
      console.log('First department structure:', departmentsData[0]);
      console.log('First department building:', departmentsData[0]?.building);
      setDepartments(departmentsData);
    } catch (err) {
      setError(err.message);
    }
  };

  const fetchOverview = async () => {
    try {
      const overviewData = await overviewAPI.get();
      setOverviewStats(overviewData);
      if (typeof overviewData.maintenanceMode === 'boolean') {
        setMaintenanceMode(overviewData.maintenanceMode);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const fetchSettings = async () => {
    try {
      const settingsData = await settingsAPI.get();
      if (typeof settingsData.maintenanceMode === 'boolean') {
        setMaintenanceMode(settingsData.maintenanceMode);
      }
      setOverviewStats((prev) => ({
        ...prev,
        kioskStatus: settingsData.kioskStatus || prev.kioskStatus,
        maintenanceMode: typeof settingsData.maintenanceMode === 'boolean'
          ? settingsData.maintenanceMode
          : prev.maintenanceMode,
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      switch (activeTab) {
        case 'buildings': {
          const buildingsData = user?.role === 'super_admin'
            ? await buildingsAPI.getAll()
            : await buildingsAPI.getByDepartment();
          setBuildings(buildingsData);
          break;
        }
        case 'rooms': {
          const [roomsData, buildingsData] = await Promise.all([
            roomsAPI.getAll(),
            buildingsAPI.getAll(),
          ]);
          setRooms(roomsData);
          setBuildings(buildingsData);
          break;
        }
        case 'offices': {
          const [officesData, buildingsData] = await Promise.all([
            officesAPI.getAll(),
            buildingsAPI.getAll(),
          ]);
          setOffices(officesData);
          setBuildings(buildingsData);
          break;
        }
        case 'faculty': {
          const [facultyData, facultyOfficesData, facultyDepartmentsData] = await Promise.all([
            facultyAPI.getAll(),
            officesAPI.getAll(),
            departmentsAPI.getAll(),
          ]);
          setFaculty(facultyData);
          setOffices(facultyOfficesData);
          setDepartments(facultyDepartmentsData);
          break;
        }
        case 'services': {
          const [servicesData, servicesOfficesData, servicesBuildingsData] = await Promise.all([
            servicesAPI.getAll(),
            officesAPI.getAll(),
            buildingsAPI.getAll(),
          ]);
          setServices(servicesData);
          setOffices(servicesOfficesData);
          setBuildings(servicesBuildingsData);
          break;
        }
        case 'faqs': {
          const [faqsData, faqOfficesData, faqDepartmentsData] = await Promise.all([
            faqsAPI.getAll(),
            officesAPI.getAll(),
            departmentsAPI.getAll(),
          ]);
          setFaqs(faqsData);
          setOffices(faqOfficesData);
          setDepartments(faqDepartmentsData);
          break;
        }
        case 'resources': {
          const [resourcesData, resourceFaqsData, resourceOfficesData, resourceDepartmentsData] = await Promise.all([
            resourcesAPI.getAll(),
            faqsAPI.getAll(),
            officesAPI.getAll(),
            departmentsAPI.getAll(),
          ]);
          setResources(resourcesData);
          setFaqs(resourceFaqsData);
          setOffices(resourceOfficesData);
          setDepartments(resourceDepartmentsData);
          break;
        }
        case 'departments':
          const [departmentsData, deptBuildingsData] = await Promise.all([
            departmentsAPI.getAll(),
            buildingsAPI.getAll(),
          ]);
          setDepartments(departmentsData);
          setBuildings(deptBuildingsData);
          break;
        default:
          break;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingItem(null);
    setError('');
    if (activeTab === 'departments') {
      setFormData({ name: '', code: '', description: '', building: '', floor: '', active: true, organizationalChart: null });
    } else if (activeTab === 'offices') {
      setFormData({ name: '', building: '', floor: '', department: '', organizationalChart: null });
    } else if (activeTab === 'services') {
      setFormData({
        name: '',
        description: '',
        category: '',
        stakeholders: [],
        requirementsText: '',
        stepsText: '',
        deadline: '',
        processingTime: '',
        sourceOffice: '',
        source: '',
        verifiedBy: '',
        verificationStatus: 'verified',
        office: '',
        department: '',
        assignmentType: 'office',
      });
    } else if (activeTab === 'faqs') {
      setFormData({
        name: '',
        verifiedAnswer: '',
        office: '',
        department: '',
        downloadableResourcesText: '',
      });
    } else if (activeTab === 'resources') {
      setFormData({
        title: '',
        description: '',
        type: 'PDF',
        category: '',
        stakeholders: [],
        url: '',
        office: '',
        department: '',
        faqs: [],
        verified: true,
        isActive: true,
        lastVerified: new Date().toISOString().slice(0, 10),
        verifiedBy: '',
        source: '',
      });
    } else if (activeTab === 'faculty') {
      setFormData({
        name: '', title: '', positionType: '', customPosition: '', contactInfo: '',
        office: '', department: '', supervisorId: '', assignmentType: 'office',
      });
    } else {
      setFormData({});
    }
    setFormErrors({});
    setShowForm(true);
  };

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      logout();
      navigate('/');
    }
  };

  const handleSettingsNav = (sectionId) => {
    setSettingsSection(sectionId);
    const target = document.getElementById(`settings-${sectionId}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const updateSettings = async (nextSettings) => {
    try {
      const updated = await settingsAPI.update(nextSettings);
      setMaintenanceMode(updated.maintenanceMode);
      setOverviewStats((prev) => ({
        ...prev,
        maintenanceMode: updated.maintenanceMode,
        kioskStatus: updated.kioskStatus || prev.kioskStatus,
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const getDepartmentSelectionValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const byId = departments.find((dept) => String(dept?._id || '') === raw);
    if (byId?._id) return String(byId._id);

    const byName = departments.find((dept) => String(dept?.name || '').trim() === raw);
    if (byName?._id) return String(byName._id);

    const byCode = departments.find((dept) => String(dept?.code || '').trim() === raw);
    if (byCode?._id) return String(byCode._id);

    return '';
  };

  const getDepartmentNameFromSelection = (selectionValue) => {
    const key = String(selectionValue || '').trim();
    if (!key) return '';

    const selected = departments.find((dept) => String(dept?._id || '') === key);
    if (selected?.name) return String(selected.name).trim();

    const byName = departments.find((dept) => String(dept?.name || '').trim() === key);
    if (byName?.name) return String(byName.name).trim();

    const byCode = departments.find((dept) => String(dept?.code || '').trim() === key);
    if (byCode?.name) return String(byCode.name).trim();

    return key;
  };

  const getItemId = (item) => String(item?._id || item || '');

  const getMultiSelectValues = (event) => Array.from(event.target.selectedOptions || [])
    .map((option) => option.value)
    .filter(Boolean);

  const splitTextareaLines = (value) => Array.from(new Set(String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)));

  const getDownloadableResourceText = (item) => {
    const resourcesList = Array.isArray(item?.downloadableResources) ? item.downloadableResources : [];
    return resourcesList
      .map((resource) => {
        const title = String(resource?.name || resource?.title || '').trim();
        const url = String(resource?.url || '').trim();
        if (!url) return '';
        return title ? `${title} | ${url}` : url;
      })
      .filter(Boolean)
      .join('\n');
  };

  const parseDownloadableResourceText = (value) => splitTextareaLines(value)
    .map((line) => {
      const parts = line.split('|').map((part) => part.trim()).filter(Boolean);
      const url = parts.length > 1 ? parts[parts.length - 1] : line.trim();
      const explicitName = parts.length > 1 ? parts.slice(0, -1).join(' | ') : '';
      let fallbackName = url;
      try {
        const parsed = new URL(url);
        const filename = parsed.pathname.split('/').filter(Boolean).pop();
        fallbackName = filename || parsed.hostname;
      } catch {
        fallbackName = explicitName || url;
      }
      return {
        name: explicitName || fallbackName,
        url,
        type: 'FORM',
        description: '',
      };
    });

  const isSafeHttpUrl = (value) => {
    try {
      const parsed = new URL(String(value || '').trim());
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const getDepartmentDisplayName = (value) => {
    const key = String(value?._id || value || '').trim();
    if (!key) return '';
    const match = departments.find((dept) => String(dept._id) === key || dept.name === key || dept.code === key);
    return match?.name || value?.name || key;
  };

  const getOfficeDisplayName = (value) => {
    const key = String(value?._id || value || '').trim();
    if (!key) return '';
    const match = offices.find((office) => String(office._id) === key);
    return match?.name || value?.name || key;
  };

  const handleMaintenanceModeToggle = () => {
    updateSettings({ maintenanceMode: !maintenanceMode });
  };

  const handleKioskStatusChange = (status) => {
    updateSettings({
      kioskStatus: status,
      maintenanceMode: status === 'maintenance',
    });
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }

    try {
      await authAPI.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordSuccess('Password changed successfully!');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => {
        setShowPasswordChange(false);
        setPasswordSuccess('');
      }, 2000);
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password');
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setError('');
    if (activeTab === 'departments') {
      setFormData({
        name: item.name || '',
        code: item.code || '',
        description: item.description || '',
        building: item.building?._id || item.building || '',
        floor: item.floor || '',
        active: item.active !== false,
        organizationalChart: item.organizationalChart || null,
      });
    } else if (activeTab === 'rooms') {
      setFormData({
        name: item.name || '',
        building: item.building?._id || item.building || '',
        floor: item.floor || '',
        description: item.description || '',
      });
    } else if (activeTab === 'offices') {
      setFormData({
        name: item.name || '',
        building: item.building?._id || item.building || '',
        floor: item.floor || '',
        department: item.department || '',
        organizationalChart: item.organizationalChart || null,
      });
    } else if (activeTab === 'services') {
      const hasOffice = !!(item.office?._id || item.office);
      const normalizeStepLine = (line) => String(line || '')
        .trim()
        .replace(/^\d+\s*[).:-]\s*/, '')
        .replace(/^[-*•]\s+/, '')
        .trim();

      const derivedSteps = Array.isArray(item.steps) && item.steps.length > 0
        ? item.steps
        : (typeof item.description === 'string'
            ? item.description.split(/\r?\n/).map(normalizeStepLine).filter(Boolean)
            : []);
      const derivedRequirements = Array.isArray(item.requirements) && item.requirements.length > 0
        ? item.requirements
        : [];

      setFormData({
        name: item.name || '',
        description: item.description || '',
        category: item.category || '',
        stakeholders: Array.isArray(item.stakeholders) ? item.stakeholders : (item.stakeholder ? [item.stakeholder] : []),
        requirementsText: derivedRequirements.join('\n'),
        stepsText: derivedSteps.join('\n'),
        deadline: item.deadline || '',
        processingTime: item.processingTime || '',
        sourceOffice: item.sourceOffice || '',
        source: item.source || '',
        verifiedBy: item.verifiedBy || '',
        verificationStatus: item.verificationStatus || 'verified',
        office: item.office?._id || item.office || '',
        department: getDepartmentSelectionValue(item.department),
        assignmentType: hasOffice ? 'office' : 'department',
      });
    } else if (activeTab === 'faqs') {
      setFormData({
        name: item.name || item.question || '',
        verifiedAnswer: item.verifiedAnswer || item.answer || '',
        office: item.office?._id || item.office || '',
        department: item.department?._id || item.department || '',
        downloadableResourcesText: getDownloadableResourceText(item),
      });
    } else if (activeTab === 'resources') {
      setFormData({
        title: item.title || '',
        description: item.description || '',
        type: item.type || 'PDF',
        category: item.category || '',
        stakeholders: Array.isArray(item.stakeholders) ? item.stakeholders : (item.stakeholder ? [item.stakeholder] : []),
        url: item.url || '',
        office: item.office?._id || item.office || '',
        department: item.department?._id || item.department || '',
        faqs: (item.faqs || []).map(getItemId).filter(Boolean),
        verified: item.verified === true,
        isActive: item.isActive !== false,
        lastVerified: item.lastVerified ? new Date(item.lastVerified).toISOString().slice(0, 10) : '',
        verifiedBy: item.verifiedBy || '',
        source: item.source || '',
      });
    } else if (activeTab === 'faculty') {
      const hasOffice = !!(item.office?._id || item.office);
      const existingOfficeId = item.office?._id || item.office || '';
      const existingDepartmentId = item.departmentId?._id || item.departmentId || getDepartmentSelectionValue(item.department) || item.department || '';
      const predefinedPosition = item.positionType
        ? (item.positionType !== CUSTOM_POSITION_VALUE ? findPositionByValue(item.positionType) : null)
        : findPositionByLabel(item.title);
      const positionType = predefinedPosition?.value || CUSTOM_POSITION_VALUE;
      setFormData({
        name: item.name || '',
        title: item.title || '',
        positionType,
        customPosition: positionType === CUSTOM_POSITION_VALUE ? (item.title || '') : '',
        contactInfo: item.contactInfo || '',
        office: existingOfficeId,
        department: existingDepartmentId,
        supervisorId: item.supervisorId?._id || item.supervisorId || '',
        assignmentType: hasOffice ? 'office' : 'department',
        originalAssignmentType: hasOffice ? 'office' : 'department',
        originalAssignmentId: hasOffice ? existingOfficeId : existingDepartmentId,
        isActive: item.isActive !== false,
        availabilityDays: normalizeAvailabilityDays(item.availability?.daysAvailable),
        availabilityTimeSlot: String(item.availability?.timeSlot || '').trim() || DEFAULT_AVAILABILITY_TIME_SLOT,
      });
    } else {
      setFormData(item);
    }
    setFormErrors({});
    setShowForm(true);
  };

  const handleDelete = async (id, type) => {
    if (!window.confirm(`Deactivate this ${type}?\n\nClick Confirm to deactivate or Cancel to go back.`)) return;

    try {
      switch (type) {
        case 'department':
          await departmentsAPI.delete(id);
          setDepartments((prev) => prev.map((d) => d._id === id ? { ...d, active: false } : d));
          break;
        case 'building':
          await buildingsAPI.delete(id);
          setBuildings((prev) => prev.map((b) => b._id === id ? { ...b, isActive: false } : b));
          refreshMapFeatures();
          break;
        case 'room':
          await roomsAPI.delete(id);
          setRooms((prev) => prev.map((r) => r._id === id ? { ...r, isActive: false } : r));
          refreshMapFeatures();
          break;
        case 'office':
          await officesAPI.delete(id);
          setOffices((prev) => prev.map((o) => o._id === id ? { ...o, isActive: false } : o));
          refreshMapFeatures();
          break;
        case 'faculty':
          await facultyAPI.delete(id);
          setFaculty((prev) => prev.map((f) => f._id === id ? { ...f, isActive: false } : f));
          break;
        case 'service':
          await servicesAPI.delete(id);
          setServices((prev) => prev.map((s) => s._id === id ? { ...s, isActive: false } : s));
          break;
        case 'faq':
          await faqsAPI.delete(id);
          setFaqs((prev) => prev.map((faq) => faq._id === id ? { ...faq, isActive: false } : faq));
          break;
        case 'resource':
          await resourcesAPI.delete(id);
          setResources((prev) => prev.map((resource) => resource._id === id ? { ...resource, isActive: false } : resource));
          break;
        default:
          throw new Error('Unknown delete type');
      }
      showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} deactivated successfully`);
    } catch (err) {
      showNotification(err.message || 'Failed to deactivate', 'error');
    }
  };

  const handleReactivate = async (id, type) => {
    try {
      switch (type) {
        case 'department':
          await departmentsAPI.reactivate(id);
          setDepartments((prev) => prev.map((d) => d._id === id ? { ...d, active: true } : d));
          break;
        case 'building':
          await buildingsAPI.reactivate(id);
          setBuildings((prev) => prev.map((b) => b._id === id ? { ...b, isActive: true } : b));
          refreshMapFeatures();
          break;
        case 'room':
          await roomsAPI.reactivate(id);
          setRooms((prev) => prev.map((r) => r._id === id ? { ...r, isActive: true } : r));
          refreshMapFeatures();
          break;
        case 'office':
          await officesAPI.reactivate(id);
          setOffices((prev) => prev.map((o) => o._id === id ? { ...o, isActive: true } : o));
          refreshMapFeatures();
          break;
        case 'faculty':
          await facultyAPI.reactivate(id);
          setFaculty((prev) => prev.map((f) => f._id === id ? { ...f, isActive: true } : f));
          break;
        case 'service':
          await servicesAPI.reactivate(id);
          setServices((prev) => prev.map((s) => s._id === id ? { ...s, isActive: true } : s));
          break;
        case 'faq':
          await faqsAPI.reactivate(id);
          setFaqs((prev) => prev.map((faq) => faq._id === id ? { ...faq, isActive: true } : faq));
          break;
        case 'resource':
          await resourcesAPI.reactivate(id);
          setResources((prev) => prev.map((resource) => resource._id === id ? { ...resource, isActive: true } : resource));
          break;
        default:
          throw new Error('Unknown reactivate type');
      }
      showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} activated successfully`);
    } catch (err) {
      showNotification(err.message || 'Failed to activate', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      switch (activeTab) {
        case 'departments': {
          const resolvedFloor = formData.floor
            ? Number(formData.floor)
            : formData.building
              ? 1
              : undefined;
          const payload = {
            name: (formData.name || '').trim(),
            code: (formData.code || '').trim(),
            description: (formData.description || '').trim(),
            building: formData.building || undefined,
            floor: resolvedFloor,
            active: formData.active !== undefined ? formData.active : true,
          };

          if (!payload.name) {
            throw new Error('Department name is required.');
          }

          let savedDepartment;
          if (editingItem) {
            savedDepartment = await departmentsAPI.update(editingItem._id, payload);
          } else {
            savedDepartment = await departmentsAPI.create(payload);
          }

          const departmentId = savedDepartment?._id || editingItem?._id;
          if (formData._organizationalChartData && departmentId) {
            await departmentsAPI.uploadOrganizationalChart(departmentId, {
              data: formData._organizationalChartData,
              fileName: formData._organizationalChartFileName,
              mimeType: formData._organizationalChartMimeType,
            });
          } else if (formData._removeOrganizationalChart && editingItem?._id) {
            await departmentsAPI.deleteOrganizationalChart(editingItem._id);
          }
          break;
        }
        case 'buildings': {
          const payload = {
            name: (formData.name || '').trim(),
            description: (formData.description || '').trim(),
          };

          if (formData.numberOfFloors) {
            payload.numberOfFloors = parseInt(formData.numberOfFloors);
          }

          if (!payload.name) {
            throw new Error('Building name is required.');
          }

          let savedBuilding;
          if (editingItem) {
            savedBuilding = await buildingsAPI.update(editingItem._id, payload);
          } else {
            savedBuilding = await buildingsAPI.create(payload);
          }

          // Upload image if a new file was selected
          if (formData._imagePreview) {
            const buildingId = savedBuilding._id || editingItem?._id;
            if (buildingId) {
              await buildingsAPI.uploadImage(buildingId, formData._imagePreview);
            }
          }
          // Delete image if marked for removal
          if (formData._removeImage && editingItem?._id) {
            await buildingsAPI.deleteImage(editingItem._id);
          }
          break;
        }
        case 'rooms': {
          const roomPayload = {
            ...formData,
            building: formData.building || null,
            floor: formData.floor ? Number(formData.floor) : null,
          };
          if (editingItem) {
            await roomsAPI.update(editingItem._id, roomPayload);
          } else {
            await roomsAPI.create(roomPayload);
          }
          break;
        }
        case 'offices': {
          const payload = {
            name: (formData.name || '').trim(),
            building: formData.building || null,
            floor: formData.floor ? Number(formData.floor) : null,
            department: (formData.department || '').trim(),
          };

          if (!payload.name) {
            throw new Error('Office name is required.');
          }
          if (!payload.department) {
            throw new Error('Department is required.');
          }

          let savedOffice;
          if (editingItem) {
            savedOffice = await officesAPI.update(editingItem._id, payload);
          } else {
            savedOffice = await officesAPI.create(payload);
          }

          const officeId = savedOffice?._id || editingItem?._id;
          if (formData._organizationalChartData && officeId) {
            await officesAPI.uploadOrganizationalChart(officeId, {
              data: formData._organizationalChartData,
              fileName: formData._organizationalChartFileName,
              mimeType: formData._organizationalChartMimeType,
            });
          } else if (formData._removeOrganizationalChart && editingItem?._id) {
            await officesAPI.deleteOrganizationalChart(editingItem._id);
          }
          break;
        }
        case 'faculty': {
          // Validate required fields
          const errors = {};
          if (!formData.name || !formData.name.trim()) errors.name = 'Full name is required.';
          if (!formData.positionType) errors.position = 'Please select a position.';
          if (formData.positionType === CUSTOM_POSITION_VALUE && !String(formData.customPosition || '').trim()) {
            errors.customPosition = 'Custom position is required.';
          }
          const aType = formData.assignmentType || 'office';
          if (aType === 'office' && !formData.office) errors.assignment = 'Please select an office.';
          if (aType === 'department' && !formData.department) errors.assignment = 'Please select a department.';
          // Validate email format if contactInfo looks like an email
          if (formData.contactInfo && formData.contactInfo.includes('@')) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(formData.contactInfo.trim())) {
              errors.contactInfo = 'Please enter a valid email address.';
            }
          }
          if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
          }
          const selectedPosition = findPositionByValue(formData.positionType);
          const positionTitle = formData.positionType === CUSTOM_POSITION_VALUE
            ? String(formData.customPosition || '').trim()
            : selectedPosition?.label;
          const facultyPayload = {
            name: formData.name.trim(),
            title: positionTitle,
            positionType: formData.positionType,
            supervisorId: formData.supervisorId || null,
            contactInfo: (formData.contactInfo || '').trim(),
          };

          if (editingItem) {
            facultyPayload.availability = {
              daysAvailable: normalizeAvailabilityDays(formData.availabilityDays),
              timeSlot: String(formData.availabilityTimeSlot || '').trim() || DEFAULT_AVAILABILITY_TIME_SLOT,
            };
          }

          const assignmentChanged = !editingItem
            || aType !== formData.originalAssignmentType
            || String(aType === 'office' ? formData.office : formData.department) !== String(formData.originalAssignmentId || '');
          if (assignmentChanged) {
            if (aType === 'office') facultyPayload.office = formData.office;
            else facultyPayload.departmentId = formData.department;
          }
          console.log('Personnel payload:', facultyPayload);
          if (editingItem) {
            await facultyAPI.update(editingItem._id, facultyPayload);
          } else {
            await facultyAPI.create(facultyPayload);
          }
          break;
        }
        case 'services': {
          const svcAssignType = formData.assignmentType || 'office';
          if (svcAssignType === 'office' && !formData.office) {
            throw new Error('Please assign this service to an office.');
          }
          if (svcAssignType === 'department' && !formData.department) {
            throw new Error('Please assign this service to a department.');
          }
          const normalizeStepLine = (line) => String(line || '')
            .trim()
            .replace(/^\d+\s*[).:-]\s*/, '')
            .replace(/^[-*•]\s+/, '')
            .trim();
          const steps = (typeof formData.stepsText === 'string')
            ? formData.stepsText.split(/\r?\n/).map(normalizeStepLine).filter(Boolean)
            : [];
          const requirements = (typeof formData.requirementsText === 'string')
            ? formData.requirementsText.split(/\r?\n/).map((line) => String(line || '').trim()).filter(Boolean)
            : [];

          const payload = {
            name: (formData.name || '').trim(),
            description: (formData.description || '').trim(),
            category: (formData.category || '').trim(),
            stakeholders: Array.isArray(formData.stakeholders) ? formData.stakeholders : [],
            requirements,
            steps,
            deadline: (formData.deadline || '').trim(),
            processingTime: (formData.processingTime || '').trim(),
            sourceOffice: (formData.sourceOffice || '').trim(),
            source: (formData.source || '').trim(),
            verifiedBy: (formData.verifiedBy || '').trim(),
            verificationStatus: formData.verificationStatus || 'verified',
            office: svcAssignType === 'office' ? formData.office : null,
            department: svcAssignType === 'department'
              ? getDepartmentNameFromSelection(formData.department)
              : null,
          };

          if (!payload.name) {
            throw new Error('Service name is required.');
          }

          if (editingItem) {
            await servicesAPI.update(editingItem._id, payload);
          } else {
            await servicesAPI.create(payload);
          }
          break;
        }
        case 'faqs': {
          const errors = {};
          if (!formData.name || !formData.name.trim()) errors.name = 'FAQ name / question is required.';
          if (!formData.verifiedAnswer || !formData.verifiedAnswer.trim()) errors.verifiedAnswer = 'Verified answer is required.';
          if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
          }
          const payload = {
            name: (formData.name || '').trim(),
            verifiedAnswer: (formData.verifiedAnswer || '').trim(),
            office: formData.office || null,
            department: formData.department || null,
            resources: [],
            downloadableResources: parseDownloadableResourceText(formData.downloadableResourcesText),
          };

          if (editingItem) {
            await faqsAPI.update(editingItem._id, payload);
          } else {
            await faqsAPI.create(payload);
          }
          break;
        }
        case 'resources': {
          const payload = {
            title: (formData.title || '').trim(),
            description: (formData.description || '').trim(),
            type: formData.type || 'PDF',
            category: (formData.category || '').trim(),
            stakeholders: Array.isArray(formData.stakeholders) ? formData.stakeholders : [],
            url: (formData.url || '').trim(),
            office: formData.office || null,
            department: formData.department || null,
            faqs: Array.isArray(formData.faqs) ? formData.faqs : [],
            verified: Boolean(formData.verified),
            isActive: formData.isActive !== false,
            lastVerified: formData.verified && formData.lastVerified ? formData.lastVerified : null,
            verifiedBy: (formData.verifiedBy || '').trim(),
            source: (formData.source || '').trim(),
          };

          if (!payload.title) throw new Error('Resource title is required.');
          if (!isSafeHttpUrl(payload.url)) throw new Error('Resource URL must be a valid HTTP or HTTPS URL.');

          if (editingItem) {
            await resourcesAPI.update(editingItem._id, payload);
          } else {
            await resourcesAPI.create(payload);
          }
          break;
        }
        default:
          throw new Error('Unknown form type');
      }
      await fetchData();
      setShowForm(false);
      setEditingItem(null);
      if (!['departments', 'faqs', 'resources'].includes(activeTab)) {
        await refreshMapFeatures();
      }
      const entityName = activeTab.charAt(0).toUpperCase() + activeTab.slice(1, -1);
      showNotification(`${entityName} ${editingItem ? 'updated' : 'created'} successfully`);
    } catch (err) {
      console.error('Error saving:', err);
      showNotification(err.message || 'Operation failed', 'error');
    }
  };

  const renderForm = () => {
    if (!showForm) return null;

    const formTitle = editingItem ? 'Edit' : 'Create New';
    const entityName = activeTab === 'services' ? 'Service' :
                      activeTab === 'faculty' ? 'Personnel' :
                      activeTab.charAt(0).toUpperCase() + activeTab.slice(1).slice(0, -1);
    const officeSelectGroups = [{
      label: 'Offices',
      options: offices.filter((office) => office.isActive !== false).map((office) => ({ value: office._id, label: office.name })),
    }];
    const departmentOptions = departments.filter((department) => department.active !== false).map((department) => ({
        value: department._id,
        label: department.code ? `${department.name} (${department.code})` : department.name,
      }));
    if (formData.assignmentType === 'department' && formData.department
      && !departmentOptions.some((option) => String(option.value) === String(formData.department))) {
      departmentOptions.unshift({ value: formData.department, label: `${editingItem?.department || formData.department} (existing)` });
    }
    const departmentSelectGroups = [{ label: 'Departments', options: departmentOptions }];
    const supervisorOptions = faculty
      .filter((person) => person.isActive !== false && String(person._id) !== String(editingItem?._id || ''))
      .filter((person) => {
        if ((formData.assignmentType || 'office') === 'office') {
          return formData.office && String(person.office?._id || person.office || '') === String(formData.office);
        }
        const personDepartmentId = person.departmentId?._id || person.departmentId || getDepartmentSelectionValue(person.department) || person.department;
        return formData.department && String(personDepartmentId || '') === String(formData.department);
      })
      .map((person) => ({ value: person._id, label: `${person.name}${person.title ? ` — ${person.title}` : ''}` }));
    const supervisorSelectGroups = [{
      label: 'Reporting relationship',
      options: [{ value: '', label: 'No Supervisor' }, ...supervisorOptions],
    }];

    return (
      <div className="form-modal-overlay" onClick={() => setShowForm(false)}>
        <div className="form-modal-container" onClick={(e) => e.stopPropagation()}>
          {/* Form Header */}
          <div className="form-modal-header">
            <div>
              <h2 className="form-modal-title">{formTitle} {entityName}</h2>
              <p className="form-modal-subtitle">
                {editingItem ? `Update ${entityName.toLowerCase()} information` : `Add a new ${entityName.toLowerCase()} to the system`}
              </p>
            </div>
            <button 
              type="button" 
              className="form-modal-close" 
              onClick={() => setShowForm(false)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Form Body */}
          <div className="form-modal-body">
            <form onSubmit={handleSubmit} id="entity-form">
          
          {activeTab === 'buildings' && (
            <>
              <div className="form-section-card">
                <h3 className="form-section-title">Building Information</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label required">
                      Building Name
                      <span className="form-label-hint">Official name displayed across the system</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Technology Building, Science Hall, Administration Building"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Number of Floors
                      <span className="form-label-hint">Total floors in the building</span>
                    </label>
                    <input
                      type="number"
                      className="form-input"
                      min="1"
                      max="20"
                      value={formData.numberOfFloors || ''}
                      onChange={(e) => setFormData({ ...formData, numberOfFloors: e.target.value ? parseInt(e.target.value) : '' })}
                      placeholder="e.g., 3"
                    />
                  </div>

                  <div className="form-group form-group-full">
                    <label className="form-label">
                      Description
                      <span className="form-label-hint">Brief overview of the building and its purpose</span>
                    </label>
                    <textarea
                      className="form-textarea"
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Describe the building's purpose, departments, and key facilities"
                      rows="3"
                    />
                  </div>
                </div>
              </div>

              <div className="form-section-card">
                <h3 className="form-section-title">Building Image</h3>
                <div className="form-grid">
                  <div className="form-group form-group-full">
                    <label className="form-label">
                      Upload Image
                      <span className="form-label-hint">JPG, PNG, GIF or WebP (max 5MB)</span>
                    </label>
                    {/* Image preview */}
                    {(formData._imagePreview || (formData.image && !formData._removeImage)) && (
                      <div style={{ marginBottom: 12, position: 'relative', display: 'inline-block' }}>
                        <img
                          src={formData._imagePreview || formData.image}
                          alt="Building preview"
                          style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, objectFit: 'cover', border: '1px solid #e2e8f0' }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, _imageFile: null, _imagePreview: null, _removeImage: !!formData.image });
                          }}
                          style={{
                            position: 'absolute', top: 6, right: 6,
                            background: 'rgba(239,68,68,0.9)', color: '#fff', border: 'none',
                            borderRadius: '50%', width: 28, height: 28, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14, fontWeight: 600,
                          }}
                          title="Remove image"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    {!formData._imagePreview && (!formData.image || formData._removeImage) && (
                      <div
                        style={{
                          border: '2px dashed #cbd5e1', borderRadius: 8, padding: '24px 16px',
                          textAlign: 'center', cursor: 'pointer', background: '#f8fafc',
                          transition: 'border-color 0.2s',
                        }}
                        onClick={() => document.getElementById('building-image-input').click()}
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#3b82f6'; }}
                        onDragLeave={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.borderColor = '#cbd5e1';
                          const file = e.dataTransfer.files[0];
                          if (file && file.type.startsWith('image/')) {
                            const reader = new FileReader();
                            reader.onload = (ev) => setFormData({ ...formData, _imageFile: file, _imagePreview: ev.target.result, _removeImage: false });
                            reader.readAsDataURL(file);
                          }
                        }}
                      >
                        <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                        <div style={{ color: '#64748b', fontSize: 14 }}>Click or drag an image here to upload</div>
                      </div>
                    )}
                    <input
                      id="building-image-input"
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => setFormData({ ...formData, _imageFile: file, _imagePreview: ev.target.result, _removeImage: false });
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="form-info-box">
                  <div className="form-info-icon">💡</div>
                  <div>
                    <div className="form-info-title">Tip</div>
                    <div className="form-info-text">
                      After creating the building, use the Map Editor tool to add its geometric boundaries and mark specific locations on the campus map.
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-section-card">
                <h3 className="form-section-title">Verification</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Verification Status</label>
                    <select
                      className="form-select"
                      value={formData.verificationStatus || 'verified'}
                      onChange={(e) => setFormData({ ...formData, verificationStatus: e.target.value })}
                    >
                      <option value="verified">Verified</option>
                      <option value="unverified">Unverified</option>
                      <option value="outdated">Outdated</option>
                      <option value="conflicting">Conflicting</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Verified By</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.verifiedBy || ''}
                      onChange={(e) => setFormData({ ...formData, verifiedBy: e.target.value })}
                      placeholder="Verifier name or office"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Source Office</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.sourceOffice || ''}
                      onChange={(e) => setFormData({ ...formData, sourceOffice: e.target.value })}
                      placeholder="Office that verified this process"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Source</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.source || ''}
                      onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                      placeholder="Memo, office record, URL, or document title"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
          {activeTab === 'rooms' && (
            <>
              <div className="form-section-card">
                <h3 className="form-section-title">Room Details</h3>
                <div className="form-grid">
                  <div className="form-group form-group-full">
                    <label className="form-label required">
                      Room Name/Number
                      <span className="form-label-hint">Room identifier (e.g., Room 301, Lab A)</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Room 301, Computer Lab A"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Building
                      <span className="form-label-hint">Which building is this room in? (optional)</span>
                    </label>
                    <select
                      className="form-select"
                      value={formData.building || ''}
                      onChange={(e) => setFormData({ ...formData, building: e.target.value, floor: '' })}
                    >
                      <option value="">N/A (No Building)</option>
                      {buildings.map(b => (
                        <option key={b._id} value={b._id}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Floor
                      <span className="form-label-hint">Floor level in the building</span>
                    </label>
                    <select
                      className="form-select"
                      value={formData.floor || ''}
                      onChange={(e) => setFormData({ ...formData, floor: parseInt(e.target.value) })}
                    >
                      <option value="">N/A</option>
                      {(() => {
                        const selectedBuilding = buildings.find(b => b._id === formData.building);
                        const maxFloors = selectedBuilding?.numberOfFloors || 5;
                        return Array.from({ length: maxFloors }, (_, i) => i + 1).map(floor => (
                          <option key={floor} value={floor}>
                            {floor}{floor === 1 ? 'st' : floor === 2 ? 'nd' : floor === 3 ? 'rd' : 'th'} Floor
                          </option>
                        ));
                      })()}
                    </select>
                  </div>

                  <div className="form-group form-group-full">
                    <label className="form-label">
                      Description
                      <span className="form-label-hint">Optional details about the room</span>
                    </label>
                    <textarea
                      className="form-textarea"
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Room purpose, capacity, equipment, etc."
                      rows="3"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
          {activeTab === 'offices' && (
            <>
              <div className="form-section-card">
                <h3 className="form-section-title">Office Information</h3>
                <div className="form-grid">
                  <div className="form-group form-group-full">
                    <label className="form-label required">
                      Office Name
                      <span className="form-label-hint">Unique name for this office</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Dean's Office, Administrative Office"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Building
                      <span className="form-label-hint">Building where office is located (optional)</span>
                    </label>
                    <select
                      className="form-select"
                      value={formData.building || ''}
                      onChange={(e) => setFormData({ ...formData, building: e.target.value, floor: '' })}
                    >
                      <option value="">N/A (No Building)</option>
                      {buildings.map(b => (
                        <option key={b._id} value={b._id}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Floor
                      <span className="form-label-hint">Floor number where office is located</span>
                    </label>
                    <select
                      className="form-select"
                      value={formData.floor || ''}
                      onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                    >
                      <option value="">N/A</option>
                      {formData.building && buildings.find(b => b._id === formData.building)?.numberOfFloors
                        ? Array.from({ length: buildings.find(b => b._id === formData.building).numberOfFloors }, (_, i) => i + 1).map(floor => (
                          <option key={floor} value={floor}>{getOrdinalFloor(floor)}</option>
                        ))
                        : [1, 2, 3, 4, 5].map(floor => (
                          <option key={floor} value={floor}>{getOrdinalFloor(floor)}</option>
                        ))
                      }
                    </select>
                  </div>

                  <div className="form-group form-group-full">
                    <label className="form-label required">
                      Description
                      <span className="form-label-hint">Brief description of this office</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.department || ''}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      placeholder="e.g., Handles student enrollment and registration"
                      required
                    />
                  </div>
                </div>
              </div>
              <OrganizationalChartUpload
                formData={formData}
                setFormData={setFormData}
                onError={(message) => showNotification(message, 'error')}
                inputId="office-organizational-chart-input"
              />
            </>
          )}
          {activeTab === 'faculty' && (
            <>
              <div className="form-section-card">
                <h3 className="form-section-title">👤 Personnel Information</h3>
                <div className="form-grid">
                  <div className="form-group form-group-full">
                    <label className="form-label required">
                      Full Name
                      <span className="form-label-hint">Personnel's complete name</span>
                    </label>
                    <input
                      type="text"
                      className={`form-input ${formErrors.name ? 'form-input-error' : ''}`}
                      value={formData.name || ''}
                      onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setFormErrors({ ...formErrors, name: '' }); }}
                      placeholder="e.g., Maria Santos, John Doe"
                      required
                    />
                    {formErrors.name && <span className="form-error-text">{formErrors.name}</span>}
                  </div>

                  <div className="form-group">
                    <label className="form-label required" htmlFor="personnel-position">
                      Position
                      <span className="form-label-hint">Search categorized campus positions</span>
                    </label>
                    <SearchableSelect
                      inputId="personnel-position"
                      groups={PERSONNEL_POSITION_GROUPS}
                      value={formData.positionType || ''}
                      placeholder="Search or select position..."
                      className={formErrors.position ? 'form-input-error' : ''}
                      onChange={(positionType) => {
                        const option = findPositionByValue(positionType);
                        setFormData({
                          ...formData,
                          positionType,
                          title: positionType === CUSTOM_POSITION_VALUE ? formData.customPosition || '' : option?.label || '',
                        });
                        setFormErrors({ ...formErrors, position: '', customPosition: '' });
                      }}
                    />
                    {formErrors.position && <span className="form-error-text">{formErrors.position}</span>}
                  </div>

                  {formData.positionType === CUSTOM_POSITION_VALUE && (
                    <div className="form-group custom-position-reveal">
                      <label className="form-label required" htmlFor="custom-position">
                        Custom Position
                        <span className="form-label-hint">Enter the official title exactly as it should appear</span>
                      </label>
                      <input
                        id="custom-position"
                        type="text"
                        className={`form-input ${formErrors.customPosition ? 'form-input-error' : ''}`}
                        value={formData.customPosition || ''}
                        onChange={(e) => {
                          setFormData({ ...formData, customPosition: e.target.value, title: e.target.value });
                          setFormErrors({ ...formErrors, customPosition: '' });
                        }}
                        placeholder="Enter custom position..."
                      />
                      {formErrors.customPosition && <span className="form-error-text">{formErrors.customPosition}</span>}
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">
                      Contact Information
                      <span className="form-label-hint">Email or phone number</span>
                    </label>
                    <input
                      type="text"
                      className={`form-input ${formErrors.contactInfo ? 'form-input-error' : ''}`}
                      value={formData.contactInfo || ''}
                      onChange={(e) => { setFormData({ ...formData, contactInfo: e.target.value }); setFormErrors({ ...formErrors, contactInfo: '' }); }}
                      placeholder="e.g., email@buksu.edu.ph, +63 912 345 6789"
                    />
                    {formErrors.contactInfo && <span className="form-error-text">{formErrors.contactInfo}</span>}
                  </div>
                </div>
              </div>

              <div className="form-section-card">
                <h3 className="form-section-title">🏢 Assignment</h3>
                <p className="form-section-description">Assign this personnel to an office or a department.</p>

                <div className="assignment-type-group">
                  <label className={`assignment-type-option ${(formData.assignmentType || 'office') === 'office' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="assignmentType"
                      value="office"
                      checked={(formData.assignmentType || 'office') === 'office'}
                      onChange={() => { setFormData({ ...formData, assignmentType: 'office', department: '', supervisorId: '' }); setFormErrors({ ...formErrors, assignment: '', supervisorId: '' }); }}
                    />
                    <div className="assignment-type-content">
                      <span className="assignment-type-icon">🏢</span>
                      <div>
                        <strong>Office</strong>
                        <span>Assign to a specific office</span>
                      </div>
                    </div>
                  </label>
                  <label className={`assignment-type-option ${formData.assignmentType === 'department' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="assignmentType"
                      value="department"
                      checked={formData.assignmentType === 'department'}
                      onChange={() => { setFormData({ ...formData, assignmentType: 'department', office: '', supervisorId: '' }); setFormErrors({ ...formErrors, assignment: '', supervisorId: '' }); }}
                    />
                    <div className="assignment-type-content">
                      <span className="assignment-type-icon">🏫</span>
                      <div>
                        <strong>Department</strong>
                        <span>Assign to an academic department</span>
                      </div>
                    </div>
                  </label>
                </div>

                <div className="form-group" style={{ marginTop: '16px' }}>
                  {(formData.assignmentType || 'office') === 'office' ? (
                    <>
                      <label className="form-label required">
                        Select Office
                        <span className="form-label-hint">Choose from available offices</span>
                      </label>
                      <SearchableSelect
                        inputId="personnel-office"
                        groups={officeSelectGroups}
                        value={formData.office || ''}
                        placeholder="Search or select office..."
                        className={formErrors.assignment ? 'form-input-error' : ''}
                        onChange={(office) => {
                          setFormData({ ...formData, office, supervisorId: '' });
                          setFormErrors({ ...formErrors, assignment: '', supervisorId: '' });
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <label className="form-label required">
                        Select Department
                        <span className="form-label-hint">Choose from available departments</span>
                      </label>
                      <SearchableSelect
                        inputId="personnel-department"
                        groups={departmentSelectGroups}
                        value={formData.department || ''}
                        placeholder="Search or select department..."
                        className={formErrors.assignment ? 'form-input-error' : ''}
                        onChange={(department) => {
                          setFormData({ ...formData, department, supervisorId: '' });
                          setFormErrors({ ...formErrors, assignment: '', supervisorId: '' });
                        }}
                      />
                    </>
                  )}
                  {formErrors.assignment && <span className="form-error-text">{formErrors.assignment}</span>}
                </div>

                <div className="form-group" style={{ marginTop: '16px' }}>
                  <label className="form-label" htmlFor="personnel-supervisor">
                    Reports To
                    <span className="form-label-hint">Choose an active person from the same office or department</span>
                  </label>
                  <SearchableSelect
                    inputId="personnel-supervisor"
                    groups={supervisorSelectGroups}
                    value={formData.supervisorId || ''}
                    placeholder="Search or select supervisor..."
                    disabled={(formData.assignmentType || 'office') === 'office' ? !formData.office : !formData.department}
                    onChange={(supervisorId) => setFormData({ ...formData, supervisorId })}
                  />
                </div>
              </div>

              {editingItem && (
                <div className="form-section-card">
                  <h3 className="form-section-title">🗓 Availability</h3>
                  <div className="form-grid">
                    <div className="form-group form-group-full">
                      <label className="form-label">
                        Status
                        <span className="form-label-hint">Current personnel status</span>
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        value={formData.isActive !== false ? 'ACTIVE' : 'DEACTIVATE'}
                        readOnly
                        disabled
                      />
                    </div>

                    <div className="form-group form-group-full">
                      <label className="form-label">
                        Days Available
                        <span className="form-label-hint">Select all days this personnel is available</span>
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginTop: '8px' }}>
                        {AVAILABILITY_DAYS.map((day) => {
                          const selectedDays = normalizeAvailabilityDays(formData.availabilityDays);
                          const isChecked = selectedDays.includes(day);
                          return (
                            <label key={day} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#334155' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const nextDays = e.target.checked
                                    ? [...selectedDays, day]
                                    : selectedDays.filter((value) => value !== day);
                                  setFormData({
                                    ...formData,
                                    availabilityDays: normalizeAvailabilityDays(nextDays),
                                  });
                                }}
                              />
                              <span>{day}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="form-group form-group-full">
                      <label className="form-label">
                        Time Slot
                        <span className="form-label-hint">Default: 8:00 AM – 5:00 PM</span>
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        value={formData.availabilityTimeSlot || DEFAULT_AVAILABILITY_TIME_SLOT}
                        onChange={(e) => setFormData({ ...formData, availabilityTimeSlot: e.target.value })}
                        placeholder={DEFAULT_AVAILABILITY_TIME_SLOT}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          {activeTab === 'services' && (
            <>
              <div className="form-section-card">
                <h3 className="form-section-title">Service Details</h3>
                <div className="form-grid">
                  <div className="form-group form-group-full">
                    <label className="form-label required">
                      Service Name
                      <span className="form-label-hint">Name of the service offered</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Transcript Request, Certificate of Enrollment"
                      required
                    />
                  </div>

                  <div className="form-group form-group-full">
                    <label className="form-label">
                      Description
                      <span className="form-label-hint">Brief details about the service</span>
                    </label>
                    <textarea
                      className="form-textarea"
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Describe what this service is for and important notes"
                      rows="3"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Stakeholders</label>
                    <select
                      multiple
                      className="form-select"
                      value={formData.stakeholders || []}
                      onChange={(e) => setFormData({ ...formData, stakeholders: getMultiSelectValues(e) })}
                      style={{ minHeight: 120 }}
                    >
                      {STAKEHOLDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.category || ''}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      placeholder="Scholarship, Clearance, Admission"
                    />
                  </div>

                  <div className="form-group form-group-full">
                    <label className="form-label">
                      Requirements
                      <span className="form-label-hint">One requirement per line</span>
                    </label>
                    <textarea
                      className="form-textarea"
                      value={formData.requirementsText || ''}
                      onChange={(e) => setFormData({ ...formData, requirementsText: e.target.value })}
                      placeholder={"Valid school ID\nRequest form\nOfficial receipt"}
                      rows="4"
                    />
                  </div>

                  <div className="form-group form-group-full">
                    <label className="form-label">
                      Steps / Process
                      <span className="form-label-hint">One step per line (used by the chatbot for step-by-step instructions)</span>
                    </label>
                    <textarea
                      className="form-textarea"
                      value={formData.stepsText || ''}
                      onChange={(e) => setFormData({ ...formData, stepsText: e.target.value })}
                      placeholder={"1. Go to the office\n2. Fill out the form\n3. Pay the fee\n4. Wait for release"}
                      rows="5"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Deadline</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.deadline || ''}
                      onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                      placeholder="Only enter a verified deadline"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Processing Time</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.processingTime || ''}
                      onChange={(e) => setFormData({ ...formData, processingTime: e.target.value })}
                      placeholder="Only enter verified processing time"
                    />
                  </div>
                </div>
              </div>

              <div className="form-section-card">
                <h3 className="form-section-title">🏢 Assignment</h3>
                <p className="form-section-description">Assign this service to an office or a department.</p>

                <div className="assignment-type-group">
                  <label className={`assignment-type-option ${(formData.assignmentType || 'office') === 'office' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="serviceAssignmentType"
                      value="office"
                      checked={(formData.assignmentType || 'office') === 'office'}
                      onChange={() => { setFormData({ ...formData, assignmentType: 'office', department: '' }); setFormErrors({ ...formErrors, assignment: '' }); }}
                    />
                    <div className="assignment-type-content">
                      <span className="assignment-type-icon">🏢</span>
                      <div>
                        <strong>Office</strong>
                        <span>Assign to a specific office</span>
                      </div>
                    </div>
                  </label>
                  <label className={`assignment-type-option ${formData.assignmentType === 'department' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="serviceAssignmentType"
                      value="department"
                      checked={formData.assignmentType === 'department'}
                      onChange={() => { setFormData({ ...formData, assignmentType: 'department', office: '' }); setFormErrors({ ...formErrors, assignment: '' }); }}
                    />
                    <div className="assignment-type-content">
                      <span className="assignment-type-icon">🏫</span>
                      <div>
                        <strong>Department</strong>
                        <span>Assign to an academic department</span>
                      </div>
                    </div>
                  </label>
                </div>

                <div className="form-group" style={{ marginTop: '16px' }}>
                  {(formData.assignmentType || 'office') === 'office' ? (
                    <>
                      <label className="form-label required">
                        Select Office
                        <span className="form-label-hint">Where this service is offered</span>
                      </label>
                      <select
                        className={`form-select ${formErrors.assignment ? 'form-input-error' : ''}`}
                        value={formData.office || ''}
                        onChange={(e) => { setFormData({ ...formData, office: e.target.value }); setFormErrors({ ...formErrors, assignment: '' }); }}
                        required
                      >
                        <option value="">-- Select an Office --</option>
                        {offices.map((office) => (
                          <option key={office._id} value={office._id}>
                            {office.name}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <>
                      <label className="form-label required">
                        Select Department
                        <span className="form-label-hint">Department offering this service</span>
                      </label>
                      <select
                        className={`form-select ${formErrors.assignment ? 'form-input-error' : ''}`}
                        value={formData.department || ''}
                        onChange={(e) => { setFormData({ ...formData, department: e.target.value }); setFormErrors({ ...formErrors, assignment: '' }); }}
                        required
                      >
                        <option value="">-- Select a Department --</option>
                        {departments.map((dept) => (
                          <option key={dept._id} value={dept._id}>
                            {dept.name}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  {formErrors.assignment && <span className="form-error-text">{formErrors.assignment}</span>}
                </div>
              </div>
            </>
          )}
          {activeTab === 'faqs' && (
            <>
              <div className="form-section-card">
                <h3 className="form-section-title">FAQ Details</h3>
                <div className="form-grid">
                  <div className="form-group form-group-full">
                    <label className="form-label required">FAQ Name / Question</label>
                    <input
                      type="text"
                      className={`form-input ${formErrors.name ? 'form-input-error' : ''}`}
                      value={formData.name || ''}
                      onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setFormErrors({ ...formErrors, name: '' }); }}
                      placeholder="What are the requirements for scholarship renewal?"
                      required
                    />
                    {formErrors.name && <span className="form-error-text">{formErrors.name}</span>}
                  </div>
                  <div className="form-group form-group-full">
                    <label className="form-label required">Verified Answer</label>
                    <textarea
                      className={`form-textarea ${formErrors.verifiedAnswer ? 'form-input-error' : ''}`}
                      value={formData.verifiedAnswer || ''}
                      onChange={(e) => { setFormData({ ...formData, verifiedAnswer: e.target.value }); setFormErrors({ ...formErrors, verifiedAnswer: '' }); }}
                      placeholder="Enter the official answer the chatbot may use."
                      rows="5"
                      required
                    />
                    {formErrors.verifiedAnswer && <span className="form-error-text">{formErrors.verifiedAnswer}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Office</label>
                    <select
                      className="form-select"
                      value={formData.office || ''}
                      onChange={(e) => setFormData({ ...formData, office: e.target.value })}
                    >
                      <option value="">No office</option>
                      {offices.map((office) => (
                        <option key={office._id} value={office._id}>{office.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <select
                      className="form-select"
                      value={formData.department || ''}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    >
                      <option value="">No department</option>
                      {departments.map((dept) => (
                        <option key={dept._id} value={dept._id}>{dept.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group form-group-full">
                    <label className="form-label">Downloadable Resources</label>
                    <textarea
                      className="form-textarea"
                      value={formData.downloadableResourcesText || ''}
                      onChange={(e) => setFormData({ ...formData, downloadableResourcesText: e.target.value })}
                      placeholder="Paste one link per line, or use: Form Name | https://example.edu.ph/form.pdf"
                      rows="4"
                    />
                    <span className="form-help-text">Optional. Valid links become clickable in the chatbot.</span>
                  </div>
                </div>
              </div>
            </>
          )}
          {activeTab === 'resources' && (
            <>
              <div className="form-section-card">
                <h3 className="form-section-title">Resource Details</h3>
                <div className="form-grid">
                  <div className="form-group form-group-full">
                    <label className="form-label required">Resource Title</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.title || ''}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Scholarship Renewal Form"
                      required
                    />
                  </div>
                  <div className="form-group form-group-full">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-textarea"
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Official form for scholarship renewal."
                      rows="3"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Resource Type</label>
                    <select
                      className="form-select"
                      value={formData.type || 'PDF'}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    >
                      {RESOURCE_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.category || ''}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      placeholder="Guide, Form, Requirements"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label required">Download / Website URL</label>
                    <input
                      type="url"
                      className="form-input"
                      value={formData.url || ''}
                      onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                      placeholder="https://example.edu.ph/forms/scholarship-renewal.pdf"
                      required
                    />
                  </div>
                  <div className="form-group form-group-full">
                    <label className="form-label">Stakeholders</label>
                    <select
                      multiple
                      className="form-select"
                      value={formData.stakeholders || []}
                      onChange={(e) => setFormData({ ...formData, stakeholders: getMultiSelectValues(e) })}
                      style={{ minHeight: 120 }}
                    >
                      {STAKEHOLDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Office</label>
                    <select
                      className="form-select"
                      value={formData.office || ''}
                      onChange={(e) => setFormData({ ...formData, office: e.target.value })}
                    >
                      <option value="">No office</option>
                      {offices.map((office) => (
                        <option key={office._id} value={office._id}>{office.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <select
                      className="form-select"
                      value={formData.department || ''}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    >
                      <option value="">No department</option>
                      {departments.map((dept) => (
                        <option key={dept._id} value={dept._id}>{dept.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group form-group-full">
                    <label className="form-label">Related FAQ</label>
                    <select
                      multiple
                      className="form-select"
                      value={formData.faqs || []}
                      onChange={(e) => setFormData({ ...formData, faqs: getMultiSelectValues(e) })}
                      style={{ minHeight: 120 }}
                    >
                      {faqs.map((faq) => (
                        <option key={faq._id} value={faq._id}>{faq.question}</option>
                      ))}
                    </select>
                  </div>
                  <label className="form-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.verified !== false}
                      onChange={(e) => setFormData({ ...formData, verified: e.target.checked, lastVerified: e.target.checked && !formData.lastVerified ? new Date().toISOString().slice(0, 10) : formData.lastVerified })}
                    />
                    Verified
                  </label>
                  <label className="form-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.isActive !== false}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    />
                    Active
                  </label>
                  <div className="form-group">
                    <label className="form-label">Last Verified</label>
                    <input
                      type="date"
                      className="form-input"
                      value={formData.lastVerified || ''}
                      onChange={(e) => setFormData({ ...formData, lastVerified: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Verified By</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.verifiedBy || ''}
                      onChange={(e) => setFormData({ ...formData, verifiedBy: e.target.value })}
                      placeholder="Verifier name or office"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
          {activeTab === 'departments' && (
            <>
              <div className="form-section-card">
                <h3 className="form-section-title">Department Information</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label required">
                      Department Name
                      <span className="form-label-hint">Full official name</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Computer Science Department, IT Department"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Department Code
                      <span className="form-label-hint">Short abbreviation</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.code || ''}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      placeholder="e.g., CS, IT, ENG"
                      style={{ textTransform: 'uppercase' }}
                    />
                  </div>

                  <div className="form-group form-group-full">
                    <label className="form-label">
                      Description
                      <span className="form-label-hint">Purpose and overview of the department</span>
                    </label>
                    <textarea
                      className="form-textarea"
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Describe the department's mission, programs, and activities"
                      rows="3"
                    />
                  </div>
                </div>
              </div>

              <div className="form-section-card">
                <h3 className="form-section-title">Location</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">
                      Building
                      <span className="form-label-hint">Primary building location</span>
                    </label>
                    <select
                      className="form-select"
                      value={formData.building || ''}
                      onChange={(e) => setFormData({ ...formData, building: e.target.value, floor: e.target.value ? 1 : '' })}
                    >
                      <option value="">Select Building</option>
                      {buildings.map((building) => (
                        <option key={building._id} value={building._id}>
                          {building.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Floor
                      <span className="form-label-hint">Floor level in building</span>
                    </label>
                    <select
                      className="form-select"
                      value={formData.floor || ''}
                      onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                      disabled={!formData.building}
                    >
                      <option value="">Select Floor</option>
                      {(() => {
                        const selectedBuilding = buildings.find(b => b._id === formData.building);
                        const maxFloors = selectedBuilding?.numberOfFloors || 0;
                        return Array.from({ length: maxFloors }, (_, i) => i + 1).map(floor => (
                          <option key={floor} value={floor}>
                            {floor}{floor === 1 ? 'st' : floor === 2 ? 'nd' : floor === 3 ? 'rd' : 'th'} Floor
                          </option>
                        ));
                      })()}
                    </select>
                  </div>
                </div>
              </div>
              <OrganizationalChartUpload
                formData={formData}
                setFormData={setFormData}
                onError={(message) => showNotification(message, 'error')}
                inputId="department-organizational-chart-input"
              />
            </>
          )}
            </form>
          </div>

          {/* Error Display */}
          {error && (
            <div style={{ padding: '16px', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px', marginBottom: '16px' }}>
              <div style={{ color: '#991b1b', fontSize: '14px', fontWeight: '500' }}>
                Error: {error}
              </div>
            </div>
          )}

          {/* Form Footer */}
          <div className="form-modal-footer">
            <div className="form-modal-footer-left">
              {editingItem && (
                <button 
                  type="button" 
                  className="btn-danger-outline"
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to deactivate this ${entityName.toLowerCase()}?`)) {
                      handleDelete(editingItem._id || editingItem.id, activeTab.slice(0, -1));
                      setShowForm(false);
                    }
                  }}
                >
                  Deactivate {entityName}
                </button>
              )}
            </div>
            <div className="form-modal-footer-right">
              <button 
                type="button" 
                className="btn-secondary"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                form="entity-form"
                className="btn-primary"
              >
                {editingItem ? 'Save Changes' : `Create ${entityName}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTable = () => {
    const dataMap = {
      buildings,
      rooms,
      offices,
      faculty,
      services,
      faqs,
      resources,
      departments,
    };

    let data = dataMap[activeTab] || [];

    if (activeTab === 'faculty') {
      const normalizedQuery = facultySearch.trim().toLowerCase();
      data = normalizedQuery
        ? data.filter((member) =>
            [member.name, member.title, member.office?.name, member.departmentId?.name, member.department, member.supervisorId?.name]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(normalizedQuery))
          )
        : data;
      if (facultyStatusFilter) {
        const wantsActive = facultyStatusFilter === 'active';
        data = data.filter((m) => (m.isActive !== false) === wantsActive);
      }
    }

    if (activeTab === 'buildings') {
      const normalizedQuery = buildingSearch.trim().toLowerCase();
      data = data.filter((building) => {
        const matchesQuery = normalizedQuery
          ? [building.name, building.description]
              .filter(Boolean)
              .some((value) => value.toLowerCase().includes(normalizedQuery))
          : true;
        return matchesQuery;
      });
      if (buildingStatusFilter) {
        const wantsActive = buildingStatusFilter === 'active';
        data = data.filter((b) => (b.isActive !== false) === wantsActive);
      }
    }

    if (activeTab === 'rooms') {
      const normalizedQuery = roomSearch.trim().toLowerCase();
      data = data.filter((room) => {
        const matchesQuery = normalizedQuery
          ? [room.name, room.building?.name]
              .filter(Boolean)
              .some((value) => value.toLowerCase().includes(normalizedQuery))
          : true;
        return matchesQuery;
      });
      if (roomStatusFilter) {
        const wantsActive = roomStatusFilter === 'active';
        data = data.filter((r) => (r.isActive !== false) === wantsActive);
      }
    }

    if (activeTab === 'offices') {
      const normalizedQuery = officeSearch.trim().toLowerCase();
      data = data.filter((office) => {
        const matchesQuery = normalizedQuery
          ? [office.name, office.building?.name, office.floor]
              .filter(Boolean)
              .some((value) => value.toLowerCase().includes(normalizedQuery))
          : true;
        return matchesQuery;
      });
      if (officeStatusFilter) {
        const wantsActive = officeStatusFilter === 'active';
        data = data.filter((o) => (o.isActive !== false) === wantsActive);
      }
    }

    if (activeTab === 'departments') {
      const normalizedQuery = departmentSearch.trim().toLowerCase();
      data = normalizedQuery
        ? data.filter((department) =>
            [department.name, department.code, department.description]
              .filter(Boolean)
              .some((value) => value.toLowerCase().includes(normalizedQuery))
          )
        : data;

      if (departmentStatusFilter) {
        const wantsActive = departmentStatusFilter === 'active';
        data = data.filter((department) => (department.active !== false) === wantsActive);
      }
    }

    if (activeTab === 'services') {
      const normalizedQuery = serviceSearch.trim().toLowerCase();
      data = data.filter((service) => {
        const officeId = service.office?._id || service.office;
        const office = offices.find((item) => item._id === officeId);
        const officeName = typeof service.office === 'object' ? service.office?.name : office?.name;
        const deptName = service.department ? (departments.find((d) => d.code === service.department || d.name === service.department)?.name || service.department) : '';
        const matchesQuery = normalizedQuery
          ? [service.name, service.description, officeName, deptName]
              .filter(Boolean)
              .some((value) => value.toLowerCase().includes(normalizedQuery))
          : true;
        let matchesFilter = true;
        if (serviceDepartmentFilter) {
          if (serviceDepartmentFilter.startsWith('dept:')) {
            matchesFilter = service.department === serviceDepartmentFilter.slice(5);
          } else if (serviceDepartmentFilter.startsWith('office:')) {
            matchesFilter = String(officeId) === serviceDepartmentFilter.slice(7);
          }
        }
        return matchesQuery && matchesFilter;
      });
      if (serviceStatusFilter) {
        const wantsActive = serviceStatusFilter === 'active';
        data = data.filter((s) => (s.isActive !== false) === wantsActive);
      }
    }

    if (activeTab === 'faqs') {
      const normalizedQuery = faqSearch.trim().toLowerCase();
      data = data.filter((faq) => {
        const officeName = getOfficeDisplayName(faq.office);
        const departmentName = getDepartmentDisplayName(faq.department);
        const matchesQuery = normalizedQuery
          ? [
              faq.name || faq.question,
              faq.verifiedAnswer || faq.answer,
              faq.category,
              ...(Array.isArray(faq.keywords) ? faq.keywords : []),
              ...(Array.isArray(faq.alternativeQuestions) ? faq.alternativeQuestions : []),
              officeName,
              departmentName,
            ]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(normalizedQuery))
          : true;
        const matchesOffice = faqOfficeFilter ? String(faq.office?._id || faq.office || '') === faqOfficeFilter : true;
        return matchesQuery && matchesOffice;
      });
    }

    if (activeTab === 'resources') {
      const normalizedQuery = resourceSearch.trim().toLowerCase();
      data = data.filter((resource) => {
        const officeName = getOfficeDisplayName(resource.office);
        const departmentName = getDepartmentDisplayName(resource.department);
        const relatedQuestions = (resource.faqs || []).map((faq) => faq.name || faq.question).join(' ');
        const matchesQuery = normalizedQuery
          ? [resource.title, resource.description, resource.type, officeName, departmentName, relatedQuestions]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(normalizedQuery))
          : true;
        const matchesType = resourceTypeFilter ? resource.type === resourceTypeFilter : true;
        return matchesQuery && matchesType;
      });
      if (resourceStatusFilter) {
        data = data.filter((resource) => {
          if (resourceStatusFilter === 'verified') return resource.verified === true && resource.isActive !== false;
          if (resourceStatusFilter === 'unverified') return resource.verified !== true && resource.isActive !== false;
          if (resourceStatusFilter === 'inactive') return resource.isActive === false;
          return true;
        });
      }
    }

    if (loading) return <p>Loading...</p>;
    if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

    return (
      <table className={`data-table data-table--${activeTab}`}>
        <thead>
          <tr>
            {activeTab === 'buildings' && (
              <>
                <th>Name</th>
                <th>Floors</th>
                <th>Description</th>
                <th>Image</th>
                <th>Status</th>
                <th>Actions</th>
              </>
            )}
            {activeTab === 'rooms' && (
              <>
                <th>Name</th>
                <th>Building</th>
                <th>Floor</th>
                <th>Status</th>
                <th>Actions</th>
              </>
            )}
            {activeTab === 'offices' && (
              <>
                <th>Name</th>
                <th>Building</th>
                <th>Floor</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </>
            )}
            {activeTab === 'faculty' && (
              <>
                <th>Name</th>
                <th>Position</th>
                <th>Office / Department</th>
                <th>Reports To</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Actions</th>
              </>
            )}
            {activeTab === 'services' && (
              <>
                <th>Service Name</th>
                <th>Office / Department</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </>
            )}
            {activeTab === 'faqs' && (
              <>
                <th>FAQ Name / Question</th>
                <th>Office / Department</th>
                <th>Actions</th>
              </>
            )}
            {activeTab === 'resources' && (
              <>
                <th>Resource</th>
                <th>Type</th>
                <th>Office / Department</th>
                <th>Verification</th>
                <th>Status</th>
                <th>Actions</th>
              </>
            )}
            {activeTab === 'departments' && (
              <>
                <th>Name</th>
                <th>Code</th>
                <th>Building</th>
                <th>Floor</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item._id || item.id}>
              {activeTab === 'buildings' && (
                <>
                  <td className="td-name">{item.name}</td>
                  <td className="td-center">{item.numberOfFloors || '-'}</td>
                  <td className="td-desc">{item.description || '-'}</td>
                  <td className="td-center">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }}
                      />
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>No image</span>
                    )}
                  </td>
                  <td className="td-center">
                    <span className={`status-pill ${item.isActive !== false ? 'status-pill--active' : 'status-pill--inactive'}`}>
                      {item.isActive !== false ? 'ACTIVE' : 'DEACTIVATE'}
                    </span>
                  </td>
                  <td className="td-center">
                    <div className="action-buttons">
                      <button className="btn-icon-expanded" onClick={() => handleEdit(item)} title="Edit Building"><EditIcon /></button>
                      {item.isActive !== false
                        ? <button className="btn-deactivate" onClick={() => handleDelete(item._id, 'building')}>Deactivate</button>
                        : <button className="btn-activate" onClick={() => handleReactivate(item._id, 'building')}>Activate</button>
                      }
                    </div>
                  </td>
                </>
              )}
              {activeTab === 'rooms' && (
                <>
                  <td className="td-name">{item.name}</td>
                  <td>{item.building?.name || '-'}</td>
                  <td className="td-center">{getOrdinalFloor(item.floor)}</td>
                  <td className="td-center">
                    <span className={`status-pill ${item.isActive !== false ? 'status-pill--active' : 'status-pill--inactive'}`}>
                      {item.isActive !== false ? 'ACTIVE' : 'DEACTIVATE'}
                    </span>
                  </td>
                  <td className="td-center">
                    <div className="action-buttons">
                      <button className="btn-icon-expanded" onClick={() => handleEdit(item)} title="Edit"><EditIcon /></button>
                      {item.isActive !== false
                        ? <button className="btn-deactivate" onClick={() => handleDelete(item._id, 'room')}>Deactivate</button>
                        : <button className="btn-activate" onClick={() => handleReactivate(item._id, 'room')}>Activate</button>
                      }
                    </div>
                  </td>
                </>
              )}
              {activeTab === 'offices' && (
                <>
                  <td className="td-name">{item.name}</td>
                  <td>{item.building?.name || '-'}</td>
                  <td className="td-center">{getOrdinalFloor(item.floor)}</td>
                  <td className="td-desc">{item.department || '-'}</td>
                  <td className="td-center">
                    <span className={`status-pill ${item.isActive !== false ? 'status-pill--active' : 'status-pill--inactive'}`}>
                      {item.isActive !== false ? 'ACTIVE' : 'DEACTIVATE'}
                    </span>
                  </td>
                  <td className="td-center">
                    <div className="action-buttons">
                      <button className="btn-icon-expanded" onClick={() => handleEdit(item)} title="Edit"><EditIcon /></button>
                      {item.isActive !== false
                        ? <button className="btn-deactivate" onClick={() => handleDelete(item._id, 'office')}>Deactivate</button>
                        : <button className="btn-activate" onClick={() => handleReactivate(item._id, 'office')}>Activate</button>
                      }
                    </div>
                  </td>
                </>
              )}
              {activeTab === 'faculty' && (
                <>
                  <td>{item.name}</td>
                  <td>{item.title || '-'}</td>
                  <td>
                    {item.office?.name
                      ? <span className="assignment-badge assignment-badge--office">🏢 {item.office.name}</span>
                      : (item.departmentId?.name || item.department)
                        ? <span className="assignment-badge assignment-badge--dept">🏫 {item.department}</span>
                        : '-'}
                  </td>
                  <td>{item.supervisorId?.name || 'No Supervisor'}</td>
                  <td>{item.contactInfo || '-'}</td>
                  <td className="td-center">
                    <span className={`status-pill ${item.isActive !== false ? 'status-pill--active' : 'status-pill--inactive'}`}>
                      {item.isActive !== false ? 'ACTIVE' : 'DEACTIVATE'}
                    </span>
                  </td>
                  <td className="td-center">
                    <div className="action-buttons">
                      <button className="btn-icon-expanded" onClick={() => handleEdit(item)} title="Edit"><EditIcon /></button>
                      {item.isActive !== false
                        ? <button className="btn-deactivate" onClick={() => handleDelete(item._id, 'faculty')}>Deactivate</button>
                        : <button className="btn-activate" onClick={() => handleReactivate(item._id, 'faculty')}>Activate</button>
                      }
                    </div>
                  </td>
                </>
              )}
              {activeTab === 'services' && (
                <>
                  <td>{item.name}</td>
                  <td>
                    {(() => {
                      if (item.office) {
                        const officeId = item.office?._id || item.office;
                        const office = offices.find((o) => o._id === officeId);
                        const officeName = typeof item.office === 'object' ? item.office.name : office?.name;
                        if (officeName) {
                          return <span className="assignment-badge assignment-badge--office">🏢 {officeName}</span>;
                        }
                      }
                      if (item.department) {
                        const deptName = departments.find((dept) => dept.code === item.department || dept.name === item.department)?.name || item.department;
                        return <span className="assignment-badge assignment-badge--dept">🏫 {deptName}</span>;
                      }
                      return '-';
                    })()}
                  </td>
                  <td>{item.description || '-'}</td>
                  <td className="td-center">
                    <span className={`status-pill ${item.isActive !== false ? 'status-pill--active' : 'status-pill--inactive'}`}>
                      {item.isActive !== false ? 'ACTIVE' : 'DEACTIVATE'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-icon-expanded" onClick={() => handleEdit(item)} title="Edit"><EditIcon /></button>
                      {item.isActive !== false
                        ? <button className="btn-deactivate" onClick={() => handleDelete(item._id, 'service')}>Deactivate</button>
                        : <button className="btn-activate" onClick={() => handleReactivate(item._id, 'service')}>Activate</button>
                      }
                    </div>
                  </td>
                </>
              )}
              {activeTab === 'faqs' && (
                <>
                  <td className="td-name">
                    <div>{item.name || item.question}</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>{item.verifiedAnswer || item.answer}</div>
                  </td>
                  <td>
                    {getOfficeDisplayName(item.office)
                      ? <span className="assignment-badge assignment-badge--office">{getOfficeDisplayName(item.office)}</span>
                      : getDepartmentDisplayName(item.department)
                        ? <span className="assignment-badge assignment-badge--dept">{getDepartmentDisplayName(item.department)}</span>
                        : '-'}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-icon-expanded" onClick={() => handleEdit(item)} title="Edit FAQ"><EditIcon /></button>
                      {item.isActive !== false
                        ? <button className="btn-deactivate" onClick={() => handleDelete(item._id, 'faq')}>Deactivate</button>
                        : <button className="btn-activate" onClick={() => handleReactivate(item._id, 'faq')}>Activate</button>
                      }
                    </div>
                  </td>
                </>
              )}
              {activeTab === 'resources' && (
                <>
                  <td className="td-name">
                    <div>{item.title}</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>{item.description || '-'}</div>
                  </td>
                  <td>{item.type || '-'}</td>
                  <td>
                    {getOfficeDisplayName(item.office)
                      ? <span className="assignment-badge assignment-badge--office">{getOfficeDisplayName(item.office)}</span>
                      : getDepartmentDisplayName(item.department)
                        ? <span className="assignment-badge assignment-badge--dept">{getDepartmentDisplayName(item.department)}</span>
                        : '-'}
                  </td>
                  <td className="td-center">
                    <span className={`status-pill ${item.verified === true ? 'status-pill--active' : 'status-pill--inactive'}`}>
                      {item.verified === true ? 'VERIFIED' : 'UNVERIFIED'}
                    </span>
                  </td>
                  <td className="td-center">
                    <span className={`status-pill ${item.isActive !== false ? 'status-pill--active' : 'status-pill--inactive'}`}>
                      {item.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-icon-expanded" onClick={() => handleEdit(item)} title="Edit Resource"><EditIcon /></button>
                      {item.isActive !== false
                        ? <button className="btn-deactivate" onClick={() => handleDelete(item._id, 'resource')}>Deactivate</button>
                        : <button className="btn-activate" onClick={() => handleReactivate(item._id, 'resource')}>Activate</button>
                      }
                    </div>
                  </td>
                </>
              )}
              {activeTab === 'departments' && (
                <>
                  <td className="td-name">{item.name}</td>
                  <td>{item.code || '-'}</td>
                  <td>
                    {(() => {
                      if (typeof item.building === 'object' && item.building?.name) return item.building.name;
                      if (typeof item.building === 'string') return buildings.find(b => b._id === item.building)?.name || '-';
                      return '-';
                    })()}
                  </td>
                  <td className="td-center">{getOrdinalFloor(item.floor || (item.building ? 1 : '-'))}</td>
                  <td className="td-desc">{item.description || '-'}</td>
                  <td className="td-center">
                    <span className={`status-pill ${item.active !== false ? 'status-pill--active' : 'status-pill--inactive'}`}>
                      {item.active !== false ? 'ACTIVE' : 'DEACTIVATE'}
                    </span>
                  </td>
                  <td className="td-center">
                    <div className="action-buttons">
                      <button className="btn-icon-expanded" onClick={() => handleEdit(item)} title="Edit Department"><EditIcon /></button>
                      {item.active !== false
                        ? <button className="btn-deactivate" onClick={() => handleDelete(item._id, 'department')}>Deactivate</button>
                        : <button className="btn-activate" onClick={() => handleReactivate(item._id, 'department')}>Activate</button>
                      }
                    </div>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  if (!user || user.role !== 'super_admin') {
    return <div><h2>Administrator Dashboard</h2><p>You do not have permission to view this page.</p></div>;
  }

  const renderDashboardOverview = () => {
    const kioskStatus = (overviewStats.kioskStatus || 'unknown').toLowerCase();
    const kioskStatusLabel = kioskStatus === 'maintenance'
      ? 'Maintenance'
      : kioskStatus === 'offline'
        ? 'Offline'
        : kioskStatus === 'online'
          ? 'Online'
          : 'Unknown';
    const kioskStatusClass = kioskStatus === 'maintenance'
      ? 'status-maintenance'
      : kioskStatus === 'offline'
        ? 'status-offline'
        : kioskStatus === 'online'
          ? 'status-online'
          : 'status-unknown';
    const activeKioskCount = Number.isFinite(overviewStats.activeKiosks)
      ? overviewStats.activeKiosks
      : 0;
    const lastSyncTime = overviewStats.lastSync || 'Not synced yet';
    const kioskAlert = overviewStats.kioskAlert || 'No active alerts';
    const topBuildings = overviewStats.topBuildings || [];
    const maxActivity = topBuildings.reduce((max, building) => {
      const value = building.totalLocations || 0;
      return value > max ? value : max;
    }, 0);

    return (
      <div>
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">Dashboard</h1>
            <p className="dashboard-subtitle">
              Welcome back, <strong>{user.name || user.email}</strong>
            </p>
          </div>
        </div>

        <div className="dashboard-overview">
          <div className="overview-card overview-card--primary">
            <div className="stat-card-header">
              <div className="stat-icon stat-icon--blue"><BuildingIcon /></div>
              <div>
                <p className="stat-label">Buildings</p>
                <p className="stat-value">{overviewStats.counts?.buildings || 0}</p>
              </div>
            </div>
            <p className="stat-subtext">Total campus buildings</p>
          </div>
          <div className="overview-card overview-card--primary">
            <div className="stat-card-header">
              <div className="stat-icon stat-icon--indigo"><RoomIcon /></div>
              <div>
                <p className="stat-label">Rooms</p>
                <p className="stat-value">{overviewStats.counts?.rooms || 0}</p>
              </div>
            </div>
            <p className="stat-subtext">Total rooms</p>
          </div>
          <div className="overview-card overview-card--primary">
            <div className="stat-card-header">
              <div className="stat-icon stat-icon--teal"><OfficeIcon /></div>
              <div>
                <p className="stat-label">Offices</p>
                <p className="stat-value">{overviewStats.counts?.offices || 0}</p>
              </div>
            </div>
            <p className="stat-subtext">Administrative offices</p>
          </div>
          <div className="overview-card">
            <div className="stat-card-header">
              <div className="stat-icon stat-icon--slate"><StaffIcon /></div>
              <div>
                <p className="stat-label">Personnel</p>
                <p className="stat-value">{overviewStats.counts?.faculty || 0}</p>
              </div>
            </div>
            <p className="stat-subtext">Personnel</p>
            {overviewStats.counts?.faculty === 0 && (
              <div className="stat-empty">  
                <span>No personnel added yet.</span>
                <button
                  className="stat-empty-btn"
                  onClick={() => { setActiveTab('faculty'); handleCreate(); }}
                >
                  Add Personnel
                </button>
              </div>
            )}
          </div>
          <div className="overview-card">
            <div className="stat-card-header">
              <div className="stat-icon stat-icon--sky"><ServiceIcon /></div>
              <div>
                <p className="stat-label">Services</p>
                <p className="stat-value">{overviewStats.counts?.services || 0}</p>
              </div>
            </div>
            <p className="stat-subtext">Campus services</p>
            {overviewStats.counts?.services === 0 && (
              <div className="stat-empty">
                <span>No services created.</span>
                <button
                  className="stat-empty-btn"
                  onClick={() => { setActiveTab('services'); handleCreate(); }}
                >
                  Add Service
                </button>
              </div>
            )}
          </div>
          <div className="overview-card">
            <div className="stat-card-header">
              <div className="stat-icon stat-icon--green"><DepartmentIcon /></div>
              <div>
                <p className="stat-label">Departments</p>
                <p className="stat-value">{overviewStats.counts?.departments || 0}</p>
              </div>
            </div>
            <p className="stat-subtext">Active departments</p>
          </div>
          <div className="overview-card">
            <div className="stat-card-header">
              <div className="stat-icon stat-icon--amber"><MapPinIconOutline /></div>
              <div>
                <p className="stat-label">Map Features</p>
                <p className="stat-value">{mapFeatures?.features?.length || 0}</p>
              </div>
            </div>
            <p className="stat-subtext">Mapped locations</p>
          </div>
        </div>

        <div className="quick-actions-card">
          <div className="quick-actions-header">
            <div>
              <h2>Quick Actions</h2>
              <p>Common tasks for administrators</p>
            </div>
          </div>
          <div className="quick-actions-grid">
            <button
              onClick={() => { setActiveTab('buildings'); handleCreate(); }}
              className="quick-action-btn primary"
            >
              <BuildingIcon />
              Add Building
            </button>
            <button
              onClick={() => { setActiveTab('offices'); handleCreate(); }}
              className="quick-action-btn primary"
            >
              <OfficeIcon />
              Add Office
            </button>
            <button
              onClick={() => { setActiveTab('faculty'); handleCreate(); }}
              className="quick-action-btn secondary"
            >
              <StaffIcon />
              Add Personnel
            </button>
            <button
              onClick={() => { setActiveTab('map-editor'); setShowForm(false); }}
              className="quick-action-btn success"
            >
              <MapIconOutline />
              Open Map Editor
            </button>
          </div>
        </div>

        <div className="dashboard-panels">
          <div className="panel-card">
            <div className="panel-header">
              <div>
                <h3>Kiosk Status</h3>
                <p>Live system availability and sync health</p>
              </div>
            </div>
            <div className="kiosk-status-row">
              <span className={`status-dot ${kioskStatusClass}`} />
              <span className={`status-text ${kioskStatusClass}`}>{kioskStatusLabel}</span>
            </div>
            <div className="kiosk-metrics">
              <div>
                <span className="metric-label">Active kiosks</span>
                <span className="metric-value">{activeKioskCount}</span>
              </div>
              <div>
                <span className="metric-label">Last sync</span>
                <span className="metric-value">{lastSyncTime}</span>
              </div>
            </div>
            <div className={`kiosk-alert ${kioskStatusClass}`}>
              {kioskAlert}
            </div>
          </div>

          <div className="panel-card">
            <div className="panel-header">
              <div>
                <h3>Most Active Buildings</h3>
                <p>Based on rooms and offices activity</p>
              </div>
            </div>
            {topBuildings.length > 0 ? (
              <div className="activity-list">
                {topBuildings.map((building) => {
                  const totalLocations = building.totalLocations || 0;
                  const widthPercent = maxActivity > 0 ? (totalLocations / maxActivity) * 100 : 0;
                  return (
                    <div key={building._id || building.name} className="activity-item">
                      <div className="activity-row">
                        <span className="activity-name">{building.name}</span>
                        <span className="activity-count">{totalLocations} locations</span>
                      </div>
                      <div className="activity-bar">
                        <span style={{ width: `${widthPercent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="panel-empty">
                <p>No building activity yet.</p>
                <button
                  className="panel-empty-btn"
                  onClick={() => { setActiveTab('buildings'); handleCreate(); }}
                >
                  Add Building
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const normalizedKioskStatus = (overviewStats.kioskStatus || '').toLowerCase();

  return (
    <div className="super-admin-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>ALAGAD</h2>
          <p className="user-role"> Admin</p>
          {user && user.department && (
            <p style={{ fontSize: '12px', marginTop: '5px', color: 'rgba(255, 255, 255, 0.9)', textTransform: 'capitalize' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <MapPinIconOutline />
                {user.department} Dept
              </span>
            </p>
          )}
        </div>
        
        <nav className="sidebar-nav">
          <div className="nav-section">
            <button
              className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => { setActiveTab('dashboard'); setShowForm(false); }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <DashboardIcon />
                Dashboard
              </span>
            </button>
          </div>
          
          <div className="nav-section">
            <h4 className="nav-section-title">Management</h4>
            <button
              className={`nav-item ${activeTab === 'buildings' ? 'active' : ''}`}
              onClick={() => { setActiveTab('buildings'); setShowForm(false); }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <BuildingIcon />
                Buildings
              </span>
            </button>
            <button
              className={`nav-item ${activeTab === 'departments' ? 'active' : ''}`}
              onClick={() => { setActiveTab('departments'); setShowForm(false); }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <DepartmentIcon />
                Departments
              </span>
            </button>
            <button
              className={`nav-item ${activeTab === 'offices' ? 'active' : ''}`}
              onClick={() => { setActiveTab('offices'); setShowForm(false); }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <ServiceIcon />
                Offices
              </span>
            </button>
            <button
              className={`nav-item ${activeTab === 'services' ? 'active' : ''}`}
              onClick={() => { setActiveTab('services'); setShowForm(false); }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <ServiceIcon />
                Service List
              </span>
            </button>
            <button
              className={`nav-item ${activeTab === 'rooms' ? 'active' : ''}`}
              onClick={() => { setActiveTab('rooms'); setShowForm(false); }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <RoomIcon />
                Rooms
              </span>
            </button>
            <button
              className={`nav-item ${activeTab === 'faculty' ? 'active' : ''}`}
              onClick={() => { setActiveTab('faculty'); setShowForm(false); }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <StaffIcon />
                Personnel
              </span>
            </button>
          </div>

          <div className="nav-section">
            <h4 className="nav-section-title">FAQ & Knowledge</h4>
            <button
              className={`nav-item ${activeTab === 'faqs' ? 'active' : ''}`}
              onClick={() => { setActiveTab('faqs'); setShowForm(false); }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <ServiceIcon />
                FAQs
              </span>
            </button>
          </div>
          
          <div className="nav-section">
            <h4 className="nav-section-title">Tools</h4>
            <button
              className={`nav-item ${activeTab === 'map-editor' ? 'active' : ''}`}
              onClick={() => { setActiveTab('map-editor'); setShowForm(false); }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <MapIconOutline />
                Map Editor
              </span>
            </button>
            <button
              className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => { setActiveTab('settings'); setShowForm(false); }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <SettingsIcon />
                Settings
              </span>
            </button>
          </div>

        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Notification Toast */}
        {notification.show && (
          <div className={`notification-toast ${notification.type}`}>
            {notification.type === 'success' ? '✓' : '✕'} {notification.message}
          </div>
        )}
        
        {error && (
          <div style={{ padding: '16px', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px', marginBottom: '16px' }}>
            <div style={{ color: '#991b1b', fontSize: '14px', fontWeight: '500' }}>{error}</div>
          </div>
        )}
        {activeTab === 'dashboard' && renderDashboardOverview()}
        
        {['buildings', 'rooms', 'offices', 'faculty'].includes(activeTab) && (
          <div className="management-section">
            <div className="section-header">
              <h2>{activeTab === 'faculty' ? 'Personnel' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h2>
              <button 
                onClick={handleCreate}
                className="btn-primary"
              >
                + Add {activeTab === 'faculty' ? 'Personnel' : activeTab.slice(0, -1).charAt(0).toUpperCase() + activeTab.slice(1, -1)}
              </button>
            </div>
            {activeTab === 'buildings' && (
              <p style={{ color: '#6b7280', marginBottom: '16px' }}>Manage all campus buildings with full editing capabilities. Edit building names, locations, and descriptions. Use the Map Editor to add building locations on the campus map.</p>
            )}
            {activeTab === 'faculty' && (
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <input
                  type="text"
                  value={facultySearch}
                  onChange={(e) => setFacultySearch(e.target.value)}
                  placeholder="Search personnel..."
                  style={{ flex: '1 1 240px', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                />
                <select
                  value={facultyStatusFilter}
                  onChange={(e) => setFacultyStatusFilter(e.target.value)}
                  style={{ flex: '0 1 180px', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="deactive">Deactivate</option>
                </select>
              </div>
            )}
            {activeTab === 'buildings' && (
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <input
                  type="text"
                  value={buildingSearch}
                  onChange={(e) => setBuildingSearch(e.target.value)}
                  placeholder="Search buildings..."
                  style={{ flex: '1 1 240px', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                />
                <select
                  value={buildingStatusFilter}
                  onChange={(e) => setBuildingStatusFilter(e.target.value)}
                  style={{ flex: '0 1 180px', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="deactive">Deactivate</option>
                </select>
              </div>
            )}
            {activeTab === 'rooms' && (
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <input
                  type="text"
                  value={roomSearch}
                  onChange={(e) => setRoomSearch(e.target.value)}
                  placeholder="Search rooms..."
                  style={{ flex: '1 1 240px', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                />
                <select
                  value={roomStatusFilter}
                  onChange={(e) => setRoomStatusFilter(e.target.value)}
                  style={{ flex: '0 1 180px', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="deactive">Deactivate</option>
                </select>
              </div>
            )}
            {activeTab === 'offices' && (
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <input
                  type="text"
                  value={officeSearch}
                  onChange={(e) => setOfficeSearch(e.target.value)}
                  placeholder="Search offices..."
                  style={{ flex: '1 1 240px', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                />
                <select
                  value={officeStatusFilter}
                  onChange={(e) => setOfficeStatusFilter(e.target.value)}
                  style={{ flex: '0 1 180px', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="deactive">Deactivate</option>
                </select>
              </div>
            )}
            {renderForm()}
            {renderTable()}
          </div>
        )}
        
        {activeTab === 'departments' && (
          <div className="management-section">
            <div className="section-header">
              <h2>Department Management</h2>
              <button 
                onClick={handleCreate}
                className="btn-primary"
              >
                + Add Department
              </button>
            </div>
            <p>Manage departments and their organizational structure.</p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <input
                type="text"
                value={departmentSearch}
                onChange={(e) => setDepartmentSearch(e.target.value)}
                placeholder="Search departments..."
                style={{ flex: '1 1 240px', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
              />
              <select
                value={departmentStatusFilter}
                onChange={(e) => setDepartmentStatusFilter(e.target.value)}
                style={{ flex: '0 1 220px', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="deactive">Deactivate</option>
              </select>
            </div>
            {renderForm()}
            {renderTable()}
          </div>
        )}
        
        {activeTab === 'services' && (
          <div className="management-section">
            <div className="section-header">
              <h2>Service List</h2>
              <button 
                onClick={handleCreate}
                className="btn-primary"
              >
                + Add Service
              </button>
            </div>
            <p>Manage all services offered across campus offices and departments.</p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <input
                type="text"
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                placeholder="Search office..."
                style={{ flex: '1 1 240px', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
              />
              <select
                value={serviceStatusFilter}
                onChange={(e) => setServiceStatusFilter(e.target.value)}
                style={{ flex: '0 1 180px', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="deactive">Deactivate</option>
              </select>
              <select
                value={serviceDepartmentFilter}
                onChange={(e) => setServiceDepartmentFilter(e.target.value)}
                style={{ flex: '0 1 220px', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
              >
                <option value="">All Services</option>
                <optgroup label="Offices">
                  {offices.map((office) => (
                    <option key={office._id} value={`office:${office._id}`}>
                      {office.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Departments">
                  {departments.map((dept) => (
                    <option key={dept._id} value={`dept:${dept.code || dept.name}`}>
                      {dept.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            {renderForm()}
            {renderTable()}
          </div>
        )}

        {activeTab === 'faqs' && (
          <div className="management-section">
            <div className="section-header">
              <h2>FAQ Management</h2>
              <button onClick={handleCreate} className="btn-primary">+ Add FAQ</button>
            </div>
            <p>Manage verified campus answers that the chatbot can use as authoritative information.</p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <input
                type="text"
                value={faqSearch}
                onChange={(e) => setFaqSearch(e.target.value)}
                placeholder="Search FAQs..."
                style={{ flex: '1 1 240px', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
              />
              <select
                value={faqOfficeFilter}
                onChange={(e) => setFaqOfficeFilter(e.target.value)}
                style={{ flex: '0 1 220px', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
              >
                <option value="">All Offices</option>
                {offices.map((office) => (
                  <option key={office._id} value={office._id}>{office.name}</option>
                ))}
              </select>
            </div>
            {renderForm()}
            {renderTable()}
          </div>
        )}

        {activeTab === 'map-editor' && (
          <div className="management-section">
            <h2>Map Editor</h2>
            <p>Add, edit, and remove map markers for buildings and offices. Pins placed here will appear in the Guest View map.</p>
            <div style={{ marginTop: '16px' }}>
              <MapEditor />
            </div>
          </div>
        )}
        
        {activeTab === 'settings' && (
          <div className="settings-page">
            <div className="settings-header">
              <div>
                <h1 className="settings-title">Settings</h1>
                <p className="settings-subtitle">Manage system configuration, kiosk status, and security.</p>
              </div>
            </div>

            <div className="settings-layout">
              <div className="settings-content settings-content--full">
                <section id="settings-general" className="settings-card">
                  <div className="settings-card-header">
                    <div>
                      <h3>System Information</h3>
                      <p>Current administrator profile and access state.</p>
                    </div>
                  </div>
                  <div className="settings-info-grid">
                    <div className="settings-info-item">
                      <span className="settings-info-label">Admin Name</span>
                      <span className="settings-info-value">{user.name || user.email}</span>
                    </div>
                    <div className="settings-info-item">
                      <span className="settings-info-label">Email</span>
                      <span className="settings-info-value">{user.email}</span>
                    </div>
                    <div className="settings-info-item">
                      <span className="settings-info-label">Role</span>
                      <span className="settings-info-value">Admin</span>
                    </div>
                    <div className="settings-info-item">
                      <span className="settings-info-label">Login Status</span>
                      <div className="settings-status-row">
                        <span className="settings-badge success">Active</span>
                        <span className="settings-muted">Logged In</span>
                      </div>
                    </div>
                  </div>
                </section>

                <section id="settings-kiosk" className="settings-card">
                  <div className="settings-card-header">
                    <div>
                      <h3>Kiosk Status</h3>
                      <p>Set guest kiosk availability across campus.</p>
                    </div>
                  </div>
                  <div className="settings-status-group">
                    {['online', 'offline', 'maintenance'].map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => handleKioskStatusChange(status)}
                        className={`settings-status-btn ${normalizedKioskStatus === status ? 'active' : ''}`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </section>

                <section id="settings-account" className="settings-card settings-card-warning">
                  <div className="settings-card-header">
                    <div>
                      <h3>Sign Out</h3>
                      <p>You will be logged out and redirected to the login page.</p>
                    </div>
                    <button type="button" className="settings-logout-btn" onClick={handleLogout}>
                      Logout
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default SuperAdminDashboard;
