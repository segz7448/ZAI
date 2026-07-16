/**
 * ZAI Desktop - Icon Shim (Ionicons/MaterialIcons -> react-icons)
 *
 * Replaces @expo/vector-icons. That package's own web support pulls in
 * `react-native` as a peer dependency requiring React 19, which conflicts
 * with the React 18 / react-native-web stack this app uses everywhere
 * else - so rather than fight that peer resolution, this maps the same
 * `<Ionicons name="..." size={..} color={..} />` call shape (used
 * unchanged across every ported screen/component) onto react-icons'
 * Ionicons 5 set (react-icons/io5), which has zero React Native
 * dependency at all.
 *
 * MAPPING TABLE is exhaustive against every icon name actually used
 * across the ported codebase (verified via grep across every
 * screen/component file) - not a partial/best-guess set.
 */
import React from 'react';
import {
  IoAdd, IoAddCircleOutline, IoArrowUp, IoAttachOutline, IoCameraOutline,
  IoCheckmark, IoChevronBack, IoChevronForward, IoChevronDown, IoChevronUp,
  IoClose, IoCreateOutline, IoDownloadOutline, IoGlobeOutline, IoImageOutline,
  IoLockClosed, IoMenuOutline, IoRefresh, IoRefreshOutline, IoRemoveCircleOutline,
  IoSettingsOutline, IoSparkles, IoWarningOutline, IoCopyOutline,
  IoPlayOutline, IoPlayCircleOutline, IoStopCircleOutline,
  IoThumbsUp, IoThumbsUpOutline, IoThumbsDown, IoThumbsDownOutline,
  IoVolumeMediumOutline, IoShareOutline, IoRadioButtonOn, IoRadioButtonOff,
} from 'react-icons/io5';
import { MdInsertDriveFile } from 'react-icons/md';

const IONICONS_MAP = {
  'add': IoAdd,
  'add-circle-outline': IoAddCircleOutline,
  'arrow-up': IoArrowUp,
  'attach-outline': IoAttachOutline,
  'camera-outline': IoCameraOutline,
  'checkmark': IoCheckmark,
  'chevron-back': IoChevronBack,
  'chevron-forward': IoChevronForward,
  'chevron-down': IoChevronDown,
  'chevron-up': IoChevronUp,
  'close': IoClose,
  'create-outline': IoCreateOutline,
  'download-outline': IoDownloadOutline,
  'globe-outline': IoGlobeOutline,
  'image-outline': IoImageOutline,
  'lock-closed': IoLockClosed,
  'menu-outline': IoMenuOutline,
  'refresh': IoRefresh,
  'refresh-outline': IoRefreshOutline,
  'remove-circle-outline': IoRemoveCircleOutline,
  'settings-outline': IoSettingsOutline,
  'sparkles': IoSparkles,
  'warning-outline': IoWarningOutline,
  'copy-outline': IoCopyOutline,
  'share-outline': IoShareOutline,
  'play-outline': IoPlayOutline,
  'play-circle-outline': IoPlayCircleOutline,
  'stop-circle-outline': IoStopCircleOutline,
  'thumbs-up': IoThumbsUp,
  'thumbs-up-outline': IoThumbsUpOutline,
  'thumbs-down': IoThumbsDown,
  'thumbs-down-outline': IoThumbsDownOutline,
  'volume-medium-outline': IoVolumeMediumOutline,
  'radio-button-on': IoRadioButtonOn,
  'radio-button-off': IoRadioButtonOff,
};

const MATERIAL_ICONS_MAP = {
  'insert-drive-file': MdInsertDriveFile,
};

export function Ionicons({ name, size = 24, color = '#000', style }) {
  const IconComponent = IONICONS_MAP[name];
  if (!IconComponent) {
    console.warn(`[IconShim] Unmapped Ionicons name: "${name}"`);
    return null;
  }
  return <IconComponent size={size} color={color} style={style} />;
}

export function MaterialIcons({ name, size = 24, color = '#000', style }) {
  const IconComponent = MATERIAL_ICONS_MAP[name];
  if (!IconComponent) {
    console.warn(`[IconShim] Unmapped MaterialIcons name: "${name}"`);
    return null;
  }
  return <IconComponent size={size} color={color} style={style} />;
}
