import React from 'react';
import {
	AcademicCapIcon,
	ArrowLeftIcon,
	BriefcaseIcon,
	BuildingOffice2Icon,
	ChartBarIcon,
	ChatBubbleLeftEllipsisIcon,
	Cog6ToothIcon,
	FolderIcon,
	LockClosedIcon,
	MapIcon,
	MapPinIcon,
	MicrophoneIcon,
	PaperAirplaneIcon,
	PencilSquareIcon,
	SpeakerWaveIcon,
	Squares2X2Icon,
	StopIcon,
	TrashIcon,
	UserGroupIcon,
	UsersIcon,
	WrenchScrewdriverIcon,
	XMarkIcon,
} from '@heroicons/react/24/outline';

const DEFAULT_ICON_SIZE = 16;

const normalizeSize = (size) => (typeof size === 'number' ? `${size}px` : size);

const withSize = (className, props = {}) => {
	const { size, style, className: userClassName, ...rest } = props;
	const resolvedSize = normalizeSize(size || DEFAULT_ICON_SIZE);

	return {
		...rest,
		className: `${className || ''} ${userClassName || ''}`.trim(),
		style: {
			width: resolvedSize,
			height: resolvedSize,
			...style,
		},
	};
};

// Re-export icons with consistent styling
export const EditIcon = (props) => <PencilSquareIcon {...withSize('', props)} />;
export const DeleteIcon = (props) => <TrashIcon {...withSize('', props)} />;
export const DashboardIcon = (props) => <ChartBarIcon {...withSize('', props)} />;
export const BuildingIcon = (props) => <BuildingOffice2Icon {...withSize('', props)} />;
export const FacultyIcon = (props) => <AcademicCapIcon {...withSize('', props)} />;
export const SettingsIcon = (props) => <Cog6ToothIcon {...withSize('', props)} />;
export const MapPinIconOutline = (props) => <MapPinIcon {...withSize('', props)} />;
export const MapIconOutline = (props) => <MapIcon {...withSize('', props)} />;
export const AdminIcon = (props) => <UserGroupIcon {...withSize('', props)} />;
export const DepartmentIcon = (props) => <FolderIcon {...withSize('', props)} />;
export const LogoutIcon = (props) => <LockClosedIcon {...withSize('', props)} />;
export const BackIcon = (props) => <ArrowLeftIcon {...withSize('', props)} />;
export const CloseIcon = (props) => <XMarkIcon {...withSize('', props)} />;
export const MicIcon = (props) => <MicrophoneIcon {...withSize('', props)} />;
export const StopMicIcon = (props) => <StopIcon {...withSize('', props)} />;
export const ListeningIcon = (props) => <SpeakerWaveIcon {...withSize('', props)} />;
export const SendIcon = (props) => <PaperAirplaneIcon {...withSize('', props)} />;
export const ChatIcon = (props) => <ChatBubbleLeftEllipsisIcon {...withSize('', props)} />;
export const StaffIcon = (props) => <UsersIcon {...withSize('', props)} />;
export const RoomIcon = (props) => <Squares2X2Icon {...withSize('', props)} />;
export const OfficeIcon = (props) => <BriefcaseIcon {...withSize('', props)} />;
export const ServiceIcon = (props) => <WrenchScrewdriverIcon {...withSize('', props)} />;
