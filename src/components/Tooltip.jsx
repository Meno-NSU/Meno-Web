import './Tooltip.css';

// Styled replacement for the native `title` hint: instant, themed and localizable.
// Wraps one interactive child; the hint appears on hover and on keyboard focus.
// Hidden entirely on touch devices (no hover there) — mobile discovery is handled
// by visible labels and one-time intros (e.g. the Arena intro popup).
//
// The bubble is aria-hidden: the wrapped control keeps its own aria-label/text,
// so screen readers aren't read the same hint twice.
export default function Tooltip({ text, side = 'bottom', align = 'center', children }) {
    if (!text) return children;
    return (
        <span className={`tooltip-wrap tooltip-${side} tooltip-align-${align}`}>
            {children}
            <span className="tooltip-bubble" role="tooltip" aria-hidden="true">{text}</span>
        </span>
    );
}
