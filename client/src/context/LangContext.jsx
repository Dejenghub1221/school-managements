import { createContext, useContext, useState } from 'react';

const LangCtx = createContext();
export const useLang = () => useContext(LangCtx);

// ── Translations ──────────────────────────────────────────────────────────────
const T = {
  en: {
    dashboard: 'Dashboard', students: 'Students', teachers: 'Teachers',
    classes: 'Classes', subjects: 'Subjects', attendance: 'Attendance',
    exams: 'Exams & Results', assignments: 'Assignments', fees: 'Fees & Payments',
    parents: 'Parents', timetable: 'Timetable', library: 'Library',
    reports: 'Reports', settings: 'Settings',
    signOut: 'Sign Out', signIn: 'Sign in', menu: 'Menu', close: 'Close',
    academicYear: 'Academic year', viewOnly: 'View only',
    view: 'View', edit: 'Edit', delete: 'Delete',
    notifications: 'Notifications', noNotifications: 'No new notifications',
    upcomingExam: 'Upcoming exam', unpaidFees: 'Unpaid fees',
    darkMode: 'Dark mode', lightMode: 'Light mode', systemMode: 'System',
    language: 'Language', english: 'English', amharic: 'አማርኛ',
    print: 'Print', exportCsv: 'Export CSV', exportPdf: 'Export PDF', exportExcel: 'Export Excel',
    allRights: 'All rights reserved.',
  },
  am: {
    dashboard: 'ዳሽቦርድ', students: 'ተማሪዎች', teachers: 'አስተማሪዎች',
    classes: 'ክፍሎች', subjects: 'ትምህርቶች', attendance: 'ክትትል',
    exams: 'ፈተናዎች & ውጤቶች', assignments: 'ሥራዎች', fees: 'ክፍያዎች',
    parents: 'ወላጆች', timetable: 'የጊዜ ሰሌዳ', library: 'ቤተ መጻሕፍት',
    reports: 'ሪፖርቶች', settings: 'ቅንብሮች',
    signOut: 'ውጣ', signIn: 'ግባ', menu: 'ምናሌ', close: 'ዝጋ',
    academicYear: 'ዓ/ዓ', viewOnly: 'ማየት ብቻ',
    view: 'እይ', edit: 'አርትዕ', delete: 'ሰርዝ',
    notifications: 'ማሳወቂያዎች', noNotifications: 'አዲስ ማሳወቂያ የለም',
    upcomingExam: 'መጪ ፈተና', unpaidFees: 'ያልተከፈለ ክፍያ',
    darkMode: 'ጨለማ', lightMode: 'ብሩህ', systemMode: 'ሥርዓት',
    language: 'ቋንቋ', english: 'English', amharic: 'አማርኛ',
    print: 'አትም', exportCsv: 'CSV ላክ', exportPdf: 'PDF ላክ', exportExcel: 'Excel ላክ',
    allRights: 'መብቶች ተጠብቀዋል።',
  }
};

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en');

  const switchLang = l => {
    setLang(l);
    localStorage.setItem('lang', l);
    document.documentElement.lang = l;
  };

  const t = key => T[lang]?.[key] || T.en[key] || key;

  return (
    <LangCtx.Provider value={{ lang, switchLang, t }}>
      {children}
    </LangCtx.Provider>
  );
}
