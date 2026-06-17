// Phosphor Icons (regular weight) — a friendly, generously-rounded open set
// (MIT) in the spirit of ChatGPT/DeepSeek's iconography, rounder than Material
// Symbols so it sits closer to the Менон robot's curvature. One family → one
// consistent corner-radius language across the whole UI.
//
// Each icon is a Phosphor SVG (viewBox 0 0 256 256, fill=currentColor) imported
// via vite-plugin-svgr. `makeIcon` gives a lucide-compatible API
// (`<Icon size={20} />`, currentColor). Exports keep the old lucide names so
// call sites don't change.

import TrophySvg from '@phosphor-icons/core/assets/regular/trophy.svg?react';
import MoonSvg from '@phosphor-icons/core/assets/regular/moon.svg?react';
import SunSvg from '@phosphor-icons/core/assets/regular/sun.svg?react';
import CaretDownSvg from '@phosphor-icons/core/assets/regular/caret-down.svg?react';
import CaretRightSvg from '@phosphor-icons/core/assets/regular/caret-right.svg?react';
import WarningCircleSvg from '@phosphor-icons/core/assets/regular/warning-circle.svg?react';
import ListSvg from '@phosphor-icons/core/assets/regular/list.svg?react';
import NotePencilSvg from '@phosphor-icons/core/assets/regular/note-pencil.svg?react';
import SignInSvg from '@phosphor-icons/core/assets/regular/sign-in.svg?react';
import SignOutSvg from '@phosphor-icons/core/assets/regular/sign-out.svg?react';
import UserCircleSvg from '@phosphor-icons/core/assets/regular/user-circle.svg?react';
import LockSvg from '@phosphor-icons/core/assets/regular/lock.svg?react';
import SidebarSimpleSvg from '@phosphor-icons/core/assets/regular/sidebar-simple.svg?react';
import ChatCircleSvg from '@phosphor-icons/core/assets/regular/chat-circle.svg?react';
import ChatTextSvg from '@phosphor-icons/core/assets/regular/chat-text.svg?react';
import TrashSvg from '@phosphor-icons/core/assets/regular/trash.svg?react';
import CopySvg from '@phosphor-icons/core/assets/regular/copy.svg?react';
import CheckSvg from '@phosphor-icons/core/assets/regular/check.svg?react';
import BrainSvg from '@phosphor-icons/core/assets/regular/brain.svg?react';
import CircleNotchSvg from '@phosphor-icons/core/assets/regular/circle-notch.svg?react';
import CheckCircleSvg from '@phosphor-icons/core/assets/regular/check-circle.svg?react';
import ArrowSquareOutSvg from '@phosphor-icons/core/assets/regular/arrow-square-out.svg?react';
import DatabaseSvg from '@phosphor-icons/core/assets/regular/database.svg?react';
import PaperPlaneTiltSvg from '@phosphor-icons/core/assets/regular/paper-plane-tilt.svg?react';
import ThumbsUpSvg from '@phosphor-icons/core/assets/regular/thumbs-up.svg?react';
import ThumbsDownSvg from '@phosphor-icons/core/assets/regular/thumbs-down.svg?react';
import XSvg from '@phosphor-icons/core/assets/regular/x.svg?react';
import UsersSvg from '@phosphor-icons/core/assets/regular/users.svg?react';
import SwordSvg from '@phosphor-icons/core/assets/regular/sword.svg?react';
import HandshakeSvg from '@phosphor-icons/core/assets/regular/handshake.svg?react';
import ArrowCircleLeftSvg from '@phosphor-icons/core/assets/regular/arrow-circle-left.svg?react';
import ArrowCircleRightSvg from '@phosphor-icons/core/assets/regular/arrow-circle-right.svg?react';
import ClockSvg from '@phosphor-icons/core/assets/regular/clock.svg?react';
import CloudSlashSvg from '@phosphor-icons/core/assets/regular/cloud-slash.svg?react';
import CircleFillSvg from '@phosphor-icons/core/assets/fill/circle-fill.svg?react';

function makeIcon(Svg, displayName) {
    const Icon = ({ size = 20, className, style, title, ...rest }) => (
        <Svg
            width={size}
            height={size}
            fill="currentColor"
            aria-hidden={title ? undefined : true}
            focusable="false"
            className={className}
            style={{ display: 'block', flexShrink: 0, ...style }}
            {...rest}
        >
            {title ? <title>{title}</title> : null}
        </Svg>
    );
    Icon.displayName = displayName;
    return Icon;
}

// ── Names kept identical to the former lucide imports (drop-in swap) ──
export const Trophy = makeIcon(TrophySvg, 'Trophy');
export const Moon = makeIcon(MoonSvg, 'Moon');
export const Sun = makeIcon(SunSvg, 'Sun');
export const ChevronDown = makeIcon(CaretDownSvg, 'ChevronDown');
export const AlertCircle = makeIcon(WarningCircleSvg, 'AlertCircle');
export const Menu = makeIcon(ListSvg, 'Menu');
// "New chat" = compose (the de-facto standard in ChatGPT/Claude etc.).
export const MessageSquarePlus = makeIcon(NotePencilSvg, 'MessageSquarePlus');
export const LogIn = makeIcon(SignInSvg, 'LogIn');
export const LogOut = makeIcon(SignOutSvg, 'LogOut');
export const UserRound = makeIcon(UserCircleSvg, 'UserRound');
export const Lock = makeIcon(LockSvg, 'Lock');
// Same symmetric panel icon toggles the sidebar both ways (like ChatGPT/DeepSeek).
export const PanelLeftClose = makeIcon(SidebarSimpleSvg, 'PanelLeftClose');
export const PanelLeft = makeIcon(SidebarSimpleSvg, 'PanelLeft');
export const MessageSquare = makeIcon(ChatCircleSvg, 'MessageSquare');
export const Trash2 = makeIcon(TrashSvg, 'Trash2');
export const Copy = makeIcon(CopySvg, 'Copy');
export const Check = makeIcon(CheckSvg, 'Check');
export const Brain = makeIcon(BrainSvg, 'Brain');
export const Loader = makeIcon(CircleNotchSvg, 'Loader');
export const CheckCircle = makeIcon(CheckCircleSvg, 'CheckCircle');
export const ExternalLink = makeIcon(ArrowSquareOutSvg, 'ExternalLink');
export const Database = makeIcon(DatabaseSvg, 'Database');
export const SendHorizontal = makeIcon(PaperPlaneTiltSvg, 'SendHorizontal');
export const ThumbsUp = makeIcon(ThumbsUpSvg, 'ThumbsUp');
export const ThumbsDown = makeIcon(ThumbsDownSvg, 'ThumbsDown');
export const X = makeIcon(XSvg, 'X');
export const Users = makeIcon(UsersSvg, 'Users');

// ── New icons that replace emoji / unicode glyphs ──
export const Swords = makeIcon(SwordSvg, 'Swords');
export const Handshake = makeIcon(HandshakeSvg, 'Handshake');
export const ArrowCircleLeft = makeIcon(ArrowCircleLeftSvg, 'ArrowCircleLeft');
export const ArrowCircleRight = makeIcon(ArrowCircleRightSvg, 'ArrowCircleRight');
export const RateReview = makeIcon(ChatTextSvg, 'RateReview');
export const ChevronRight = makeIcon(CaretRightSvg, 'ChevronRight');
// model-status dots
export const Circle = makeIcon(CircleFillSvg, 'Circle'); // available (filled dot)
export const Schedule = makeIcon(ClockSvg, 'Schedule'); // rate-limited
export const CloudOff = makeIcon(CloudSlashSvg, 'CloudOff'); // unreachable
