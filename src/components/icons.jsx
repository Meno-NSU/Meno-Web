// Icon set: custom Менон icons where a bespoke glyph exists, Phosphor (regular)
// for the rest. Both are rounded, currentColor SVGs imported via
// vite-plugin-svgr, surfaced through `makeIcon` with a lucide-compatible API
// (`<Icon size={20} />`). Export names match the former lucide icons so call
// sites don't change. Custom SVGs were sliced from the brand icon sheet and
// recolored to currentColor (non-square viewBoxes are fine — the icons are
// centered, not stretched, via the default preserveAspectRatio).

// ── Custom Менон icons ──
import ChatIcon from './icons-custom/chat.svg?react';
import SidebarIcon from './icons-custom/sidebar.svg?react';
import CopyIcon from './icons-custom/copy.svg?react';
import ExternalIcon from './icons-custom/external.svg?react';
import NewChatIcon from './icons-custom/newchat.svg?react';
import MoonIcon from './icons-custom/moon.svg?react';
import SendIcon from './icons-custom/send.svg?react';
import TrophyIcon from './icons-custom/trophy.svg?react';
import CheckSquareIcon from './icons-custom/check.svg?react';
import SurveyIcon from './icons-custom/survey.svg?react';
import ArenaIcon from './icons-custom/arena.svg?react';

// ── Phosphor (regular) for everything without a custom glyph ──
import SunSvg from '@phosphor-icons/core/assets/regular/sun.svg?react';
import CaretDownSvg from '@phosphor-icons/core/assets/regular/caret-down.svg?react';
import CaretRightSvg from '@phosphor-icons/core/assets/regular/caret-right.svg?react';
import WarningCircleSvg from '@phosphor-icons/core/assets/regular/warning-circle.svg?react';
import ListSvg from '@phosphor-icons/core/assets/regular/list.svg?react';
import SignInSvg from '@phosphor-icons/core/assets/regular/sign-in.svg?react';
import SignOutSvg from '@phosphor-icons/core/assets/regular/sign-out.svg?react';
import UserCircleSvg from '@phosphor-icons/core/assets/regular/user-circle.svg?react';
import LockSvg from '@phosphor-icons/core/assets/regular/lock.svg?react';
import TrashSvg from '@phosphor-icons/core/assets/regular/trash.svg?react';
import CheckSvg from '@phosphor-icons/core/assets/regular/check.svg?react';
import BrainSvg from '@phosphor-icons/core/assets/regular/brain.svg?react';
import CircleNotchSvg from '@phosphor-icons/core/assets/regular/circle-notch.svg?react';
import DatabaseSvg from '@phosphor-icons/core/assets/regular/database.svg?react';
import ThumbsUpSvg from '@phosphor-icons/core/assets/regular/thumbs-up.svg?react';
import ThumbsDownSvg from '@phosphor-icons/core/assets/regular/thumbs-down.svg?react';
import XSvg from '@phosphor-icons/core/assets/regular/x.svg?react';
import UsersSvg from '@phosphor-icons/core/assets/regular/users.svg?react';
import HandshakeSvg from '@phosphor-icons/core/assets/regular/handshake.svg?react';
import ArrowCircleLeftSvg from '@phosphor-icons/core/assets/regular/arrow-circle-left.svg?react';
import ArrowCircleRightSvg from '@phosphor-icons/core/assets/regular/arrow-circle-right.svg?react';
import ClockSvg from '@phosphor-icons/core/assets/regular/clock.svg?react';
import CloudSlashSvg from '@phosphor-icons/core/assets/regular/cloud-slash.svg?react';
import CircleFillSvg from '@phosphor-icons/core/assets/fill/circle-fill.svg?react';

function makeIcon(Svg, displayName, { mirror = false } = {}) {
    const Icon = ({ size = 20, className, style, title, ...rest }) => (
        <Svg
            width={size}
            height={size}
            fill="currentColor"
            aria-hidden={title ? undefined : true}
            focusable="false"
            className={className}
            style={{
                display: 'block',
                flexShrink: 0,
                // Horizontal flip for directional glyphs (e.g. the sidebar
                // panel) so the close/open states point opposite ways.
                ...(mirror ? { transform: 'scaleX(-1)' } : null),
                ...style,
            }}
            {...rest}
        >
            {title ? <title>{title}</title> : null}
        </Svg>
    );
    Icon.displayName = displayName;
    return Icon;
}

// ── Custom-icon exports (names kept identical to the former lucide imports) ──
export const Trophy = makeIcon(TrophyIcon, 'Trophy');            // leaderboard / arena winner
export const Moon = makeIcon(MoonIcon, 'Moon');                  // dark theme
export const MessageSquarePlus = makeIcon(NewChatIcon, 'MessageSquarePlus'); // new chat
export const PanelLeftClose = makeIcon(SidebarIcon, 'PanelLeftClose');       // collapse sidebar
export const PanelLeft = makeIcon(SidebarIcon, 'PanelLeft', { mirror: true }); // reopen sidebar (mirrored so close/open point opposite ways)
export const MessageSquare = makeIcon(ChatIcon, 'MessageSquare'); // chat-list item
export const Copy = makeIcon(CopyIcon, 'Copy');                  // copy message
export const CheckCircle = makeIcon(CheckSquareIcon, 'CheckCircle'); // agent "done" (Обработка заняла)
export const ExternalLink = makeIcon(ExternalIcon, 'ExternalLink');  // sources link
export const SendHorizontal = makeIcon(SendIcon, 'SendHorizontal');  // send
export const RateReview = makeIcon(SurveyIcon, 'RateReview');    // end-of-session survey
export const Swords = makeIcon(ArenaIcon, 'Swords');             // arena toggle

// ── Phosphor exports (no custom glyph) ──
export const Sun = makeIcon(SunSvg, 'Sun');
export const ChevronDown = makeIcon(CaretDownSvg, 'ChevronDown');
export const ChevronRight = makeIcon(CaretRightSvg, 'ChevronRight');
export const AlertCircle = makeIcon(WarningCircleSvg, 'AlertCircle');
export const Menu = makeIcon(ListSvg, 'Menu');
export const LogIn = makeIcon(SignInSvg, 'LogIn');
export const LogOut = makeIcon(SignOutSvg, 'LogOut');
export const UserRound = makeIcon(UserCircleSvg, 'UserRound');
export const Lock = makeIcon(LockSvg, 'Lock');
export const Trash2 = makeIcon(TrashSvg, 'Trash2');
export const Check = makeIcon(CheckSvg, 'Check');               // bare check (model selected, feedback sent)
export const Brain = makeIcon(BrainSvg, 'Brain');
export const Loader = makeIcon(CircleNotchSvg, 'Loader');
export const Database = makeIcon(DatabaseSvg, 'Database');
export const ThumbsUp = makeIcon(ThumbsUpSvg, 'ThumbsUp');
export const ThumbsDown = makeIcon(ThumbsDownSvg, 'ThumbsDown');
export const X = makeIcon(XSvg, 'X');
export const Users = makeIcon(UsersSvg, 'Users');               // contributors leaderboard
export const Handshake = makeIcon(HandshakeSvg, 'Handshake');   // arena tie
export const ArrowCircleLeft = makeIcon(ArrowCircleLeftSvg, 'ArrowCircleLeft');
export const ArrowCircleRight = makeIcon(ArrowCircleRightSvg, 'ArrowCircleRight');
// model-status dots
export const Circle = makeIcon(CircleFillSvg, 'Circle');        // available
export const Schedule = makeIcon(ClockSvg, 'Schedule');         // rate-limited
export const CloudOff = makeIcon(CloudSlashSvg, 'CloudOff');    // unreachable
