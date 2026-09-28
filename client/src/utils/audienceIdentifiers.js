export const getStudentIdentifiers = (student) => {
  const raw = [
    student?.name,
    student?.username,
    student?.email,
    student?.firstName && student?.lastName
      ? `${student.firstName} ${student.lastName}`.trim()
      : null,
  ];

  if (typeof window !== 'undefined') {
    try {
      const feedechoName = localStorage.getItem('feedecho_name');
      const sessionName = sessionStorage.getItem('studentName');
      if (feedechoName) raw.push(feedechoName);
      if (sessionName) raw.push(sessionName);
    } catch {
      // ignore storage access errors
    }
  }

  return [...new Set(raw.filter(Boolean).map((s) => String(s).toLowerCase().trim()))];
};

export const matchesStudent = (recordName, identifiers) => {
  if (!identifiers?.length) return false;
  const n = String(recordName || '').toLowerCase().trim();
  if (!n) return false;
  return identifiers.some((id) => n === id || n.includes(id) || id.includes(n));
};

export const matchesStudentRecord = (record, student, _options = {}) => {
  if (!student) {
    const recordName = record?.studentName || record?.name || '';
    return matchesStudent(recordName, []);
  }

  const studentUid = student.uid ? String(student.uid).trim() : '';
  const studentEmail = student.email ? String(student.email).toLowerCase().trim() : '';

  // Logged-in audience: only show attempts recorded with this account's identity.
  // Never fall back to name matching — that pulls in prior guest attempts.
  if (studentUid) {
    return Boolean(record?.studentUid) && String(record.studentUid).trim() === studentUid;
  }
  if (studentEmail) {
    return (
      Boolean(record?.studentEmail) &&
      String(record.studentEmail).toLowerCase().trim() === studentEmail
    );
  }

  // Guest viewer (no account): match by name identifiers only.
  const identifiers = getStudentIdentifiers(student);
  return matchesStudent(record?.studentName || record?.name, identifiers);
};

export const getStudentQueryParams = (student) => {
  if (!student) return {};
  const identifiers = getStudentIdentifiers(student);
  return {
    name: student.name || identifiers[0] || '',
    email: student.email || '',
    username: student.username || student.email || '',
    uid: student.uid || '',
    aliases: identifiers.join(','),
  };
};
