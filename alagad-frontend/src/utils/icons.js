import React from 'react';
import {
  LuPencil,
  LuTrash2,
  LuChartNoAxesCombined,
  LuBuilding2,
  LuGraduationCap,
  LuSettings2,
  LuMapPin,
  LuMap,
  LuUsersRound,
  LuLandmark,
  LuLogOut,
  LuArrowLeft,
  LuX,
  LuMic,
  LuSquare,
  LuVolume2,
  LuSend,
  LuMessageCircle,
  LuUsers,
  LuDoorOpen,
  LuBriefcaseBusiness,
  LuWrench,
  LuNetwork,
  LuNavigation,
  LuInfo,
  LuClipboardList
} from 'react-icons/lu';

// One outline family, optical weight, and sizing contract across the app.
const createIcon = (Glyph) => {
  const Icon = ({ size = 16, className = '', style, title, ...props }) => (
    <Glyph
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
      focusable="false"
      strokeWidth={1.75}
      {...props}
      className={`app-icon ${className}`.trim()}
      style={{ width: size, height: size, ...style }}
    />
  );
  return Icon;
};

export const EditIcon = createIcon(LuPencil);
export const DeleteIcon = createIcon(LuTrash2);
export const DashboardIcon = createIcon(LuChartNoAxesCombined);
export const BuildingIcon = createIcon(LuBuilding2);
export const FacultyIcon = createIcon(LuGraduationCap);
export const SettingsIcon = createIcon(LuSettings2);
export const MapPinIconOutline = createIcon(LuMapPin);
export const MapIconOutline = createIcon(LuMap);
export const AdminIcon = createIcon(LuUsersRound);
export const DepartmentIcon = createIcon(LuLandmark);
export const LogoutIcon = createIcon(LuLogOut);
export const BackIcon = createIcon(LuArrowLeft);
export const CloseIcon = createIcon(LuX);
export const MicIcon = createIcon(LuMic);
export const StopMicIcon = createIcon(LuSquare);
export const ListeningIcon = createIcon(LuVolume2);
export const SendIcon = createIcon(LuSend);
export const ChatIcon = createIcon(LuMessageCircle);
export const StaffIcon = createIcon(LuUsers);
export const RoomIcon = createIcon(LuDoorOpen);
export const OfficeIcon = createIcon(LuBriefcaseBusiness);
export const ServiceIcon = createIcon(LuWrench);
export const OrgChartIcon = createIcon(LuNetwork);
export const NavigationIcon = createIcon(LuNavigation);
export const InfoIcon = createIcon(LuInfo);
export const TypeIcon = createIcon(LuClipboardList);
