import { Routes, Route } from 'react-router-dom';
import App from '../App.jsx';
import LegalPage from './LegalPage.jsx';

// Route table, kept out of main.jsx so it's testable with MemoryRouter. The three
// legal documents get their own URLs; every other path is the chat app, unchanged.
export default function AppRoutes() {
    return (
        <Routes>
            <Route path="/privacy" element={<LegalPage kind="privacy_policy" />} />
            <Route path="/consent" element={<LegalPage kind="personal_data_consent" />} />
            <Route path="/terms" element={<LegalPage kind="terms_of_use" />} />
            <Route path="*" element={<App />} />
        </Routes>
    );
}
