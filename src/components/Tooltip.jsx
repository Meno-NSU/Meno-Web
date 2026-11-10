import './Tooltip.css';

// Styled replacement for the native `title` hint: instant, themed and localizable.
// Wraps one interactive child; the hint appears on hover and on keyboard focus.
// Hidden entirely on touch devices (no hover there) — mobile discovery is handled
// by visible labels and one-time intros (e.g. the Arena intro popup).
//
// The bubble is aria-hidden: the wrapped control keeps its own aria-label/text,
// so screen readers aren't read the same hint twice. A control whose name is not
// the hint can still offer it as a description: pass `id` and point the control's
// aria-describedby at it.
export default function Tooltip({ text, side = 'bottom', align = 'center', id, children }) {
    if (!text) return children;
    return (
        <span className={`tooltip-wrap tooltip-${side} tooltip-align-${align}`}>
            {children}
            <span id={id} className="tooltip-bubble" role="tooltip" aria-hidden="true">{text}</span>
        </span>
    );
}
