// Material Symbols (Rounded) icon set — the rounded optical style matches the
// curvature of the Менон robot mark, so the whole UI reads as one family.
//
// Each icon is the official Material Symbols Rounded SVG (viewBox 0 -960 960
// 960) imported as a React component via vite-plugin-svgr. `makeIcon` gives
// them a lucide-compatible API (`<Icon size={20} />`, currentColor) so call
// sites barely change. Exports are NAMED after their former lucide icons to
// keep the swap a one-line import change per component.

import AddCircleSvg from '@material-symbols/svg-400/rounded/add_circle.svg?react';
import AccountCircleSvg from '@material-symbols/svg-400/rounded/account_circle.svg?react';
import ArrowCircleLeftSvg from '@material-symbols/svg-400/rounded/arrow_circle_left.svg?react';
import ArrowCircleRightSvg from '@material-symbols/svg-400/rounded/arrow_circle_right.svg?react';
import ChatBubbleSvg from '@material-symbols/svg-400/rounded/chat_bubble.svg?react';
import CheckSvg from '@material-symbols/svg-400/rounded/check.svg?react';
import CheckCircleSvg from '@material-symbols/svg-400/rounded/check_circle.svg?react';
import ChevronRightSvg from '@material-symbols/svg-400/rounded/chevron_right.svg?react';
import CircleSvg from '@material-symbols/svg-400/rounded/circle.svg?react';
import CloseSvg from '@material-symbols/svg-400/rounded/close.svg?react';
import CloudOffSvg from '@material-symbols/svg-400/rounded/cloud_off.svg?react';
import ContentCopySvg from '@material-symbols/svg-400/rounded/content_copy.svg?react';
import DarkModeSvg from '@material-symbols/svg-400/rounded/dark_mode.svg?react';
import DatabaseSvg from '@material-symbols/svg-400/rounded/database.svg?react';
import DeleteSvg from '@material-symbols/svg-400/rounded/delete.svg?react';
import ErrorSvg from '@material-symbols/svg-400/rounded/error.svg?react';
import GroupSvg from '@material-symbols/svg-400/rounded/group.svg?react';
import HandshakeSvg from '@material-symbols/svg-400/rounded/handshake.svg?react';
import KeyboardArrowDownSvg from '@material-symbols/svg-400/rounded/keyboard_arrow_down.svg?react';
import MenuOpenSvg from '@material-symbols/svg-400/rounded/menu_open.svg?react';
import LightModeSvg from '@material-symbols/svg-400/rounded/light_mode.svg?react';
import LockSvg from '@material-symbols/svg-400/rounded/lock.svg?react';
import LoginSvg from '@material-symbols/svg-400/rounded/login.svg?react';
import LogoutSvg from '@material-symbols/svg-400/rounded/logout.svg?react';
import MenuSvg from '@material-symbols/svg-400/rounded/menu.svg?react';
import OpenInNewSvg from '@material-symbols/svg-400/rounded/open_in_new.svg?react';
import ProgressActivitySvg from '@material-symbols/svg-400/rounded/progress_activity.svg?react';
import PsychologySvg from '@material-symbols/svg-400/rounded/psychology.svg?react';
import RateReviewSvg from '@material-symbols/svg-400/rounded/rate_review.svg?react';
import ScheduleSvg from '@material-symbols/svg-400/rounded/schedule.svg?react';
import SendSvg from '@material-symbols/svg-400/rounded/send.svg?react';
import SwordsSvg from '@material-symbols/svg-400/rounded/swords.svg?react';
import ThumbDownSvg from '@material-symbols/svg-400/rounded/thumb_down.svg?react';
import ThumbUpSvg from '@material-symbols/svg-400/rounded/thumb_up.svg?react';
import TrophySvg from '@material-symbols/svg-400/rounded/trophy.svg?react';

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
export const Moon = makeIcon(DarkModeSvg, 'Moon');
export const Sun = makeIcon(LightModeSvg, 'Sun');
export const ChevronDown = makeIcon(KeyboardArrowDownSvg, 'ChevronDown');
export const AlertCircle = makeIcon(ErrorSvg, 'AlertCircle');
export const Menu = makeIcon(MenuSvg, 'Menu');
export const MessageSquarePlus = makeIcon(AddCircleSvg, 'MessageSquarePlus');
export const LogIn = makeIcon(LoginSvg, 'LogIn');
export const LogOut = makeIcon(LogoutSvg, 'LogOut');
export const UserRound = makeIcon(AccountCircleSvg, 'UserRound');
export const Lock = makeIcon(LockSvg, 'Lock');
// Collapse / reopen sidebar — the hamburger pair reads rounder (rounded
// strokes, no sharp panel rectangle) and matches the robot better.
export const PanelLeftClose = makeIcon(MenuOpenSvg, 'PanelLeftClose');
export const PanelLeft = makeIcon(MenuSvg, 'PanelLeft');
export const MessageSquare = makeIcon(ChatBubbleSvg, 'MessageSquare');
export const Trash2 = makeIcon(DeleteSvg, 'Trash2');
export const Copy = makeIcon(ContentCopySvg, 'Copy');
export const Check = makeIcon(CheckSvg, 'Check');
export const Brain = makeIcon(PsychologySvg, 'Brain');
export const Loader = makeIcon(ProgressActivitySvg, 'Loader');
export const CheckCircle = makeIcon(CheckCircleSvg, 'CheckCircle');
export const ExternalLink = makeIcon(OpenInNewSvg, 'ExternalLink');
export const Database = makeIcon(DatabaseSvg, 'Database');
export const SendHorizontal = makeIcon(SendSvg, 'SendHorizontal');
export const ThumbsUp = makeIcon(ThumbUpSvg, 'ThumbsUp');
export const ThumbsDown = makeIcon(ThumbDownSvg, 'ThumbsDown');
export const X = makeIcon(CloseSvg, 'X');
export const Users = makeIcon(GroupSvg, 'Users');

// ── New icons that replace emoji / unicode glyphs ──
export const Swords = makeIcon(SwordsSvg, 'Swords');
export const Handshake = makeIcon(HandshakeSvg, 'Handshake');
export const ArrowCircleLeft = makeIcon(ArrowCircleLeftSvg, 'ArrowCircleLeft');
export const ArrowCircleRight = makeIcon(ArrowCircleRightSvg, 'ArrowCircleRight');
export const RateReview = makeIcon(RateReviewSvg, 'RateReview');
export const ChevronRight = makeIcon(ChevronRightSvg, 'ChevronRight');
// model-status dots
export const Circle = makeIcon(CircleSvg, 'Circle'); // available
export const Schedule = makeIcon(ScheduleSvg, 'Schedule'); // rate-limited
export const CloudOff = makeIcon(CloudOffSvg, 'CloudOff'); // unreachable
