const express = require('express');
const { db } = require('../config/firebase');
const { verifyFirebaseToken, checkRole, checkOwnership } = require('../middleware/auth');
const router = express.Router();

const coursesRef = () => db.ref('courses');
const courseRef = (id) => db.ref(`courses/${id}`);
const enrollmentsRef = () => db.ref('enrollments');
const usersRef = (uid) => db.ref(`users/${uid}`);

const generateId = (prefix = 'course') =>
  `${prefix}-${Math.random().toString(36).substring(2, 10)}-${Date.now()}`;

// Get all courses (public courses + enrolled courses for authenticated users)
router.get('/', async (req, res) => {
  try {
    const { category, level, search, limit = 20, offset = 0 } = req.query;
    const snap = await coursesRef().get();
    const all = snap.exists() ? snap.val() : {};

    let courses = Object.entries(all || {})
      .map(([id, data]) => ({ id, ...(data || {}) }))
      .filter((c) => c.isPublic === true);

    if (category) courses = courses.filter((c) => c.category === category);
    if (level) courses = courses.filter((c) => c.level === level);

    courses.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    const lim = Math.max(0, parseInt(limit, 10) || 0);
    const off = Math.max(0, parseInt(offset, 10) || 0);
    courses = courses.slice(off, lim ? off + lim : undefined);

    // Hydrate instructor info
    for (const c of courses) {
      if (!c.createdBy) {
        c.instructor = null;
        continue;
      }
      const instructorSnap = await usersRef(c.createdBy).get();
      const instructor = instructorSnap.exists() ? instructorSnap.val() : null;
      c.instructor = instructor ? {
        displayName: instructor.displayName,
        profileImage: instructor.profileImage
      } : null;
    }

    // Apply search filter (client-side for simplicity)
    if (search) {
      const searchLower = search.toLowerCase();
      const filtered = courses.filter(course => 
        course.title.toLowerCase().includes(searchLower) ||
        course.description.toLowerCase().includes(searchLower)
      );
      return res.json({ courses: filtered });
    }

    res.json({ courses });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Error fetching courses' });
  }
});

// Get course by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const snap = await courseRef(id).get();
    if (!snap.exists()) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const courseData = snap.val() || {};

    // Get instructor info
    const instructorSnap = courseData.createdBy ? await usersRef(courseData.createdBy).get() : null;
    const instructor = instructorSnap && instructorSnap.exists() ? instructorSnap.val() : null;

    // Get enrollment count (fallback if course.enrolledStudents missing)
    let enrollmentCount = Number(courseData.enrolledStudents || 0);
    if (!enrollmentCount) {
      const enrollSnap = await enrollmentsRef().orderByChild('courseId').equalTo(id).get();
      enrollmentCount = enrollSnap.exists() ? Object.keys(enrollSnap.val() || {}).length : 0;
    }

    const course = {
      id,
      ...courseData,
      instructor: instructor ? {
        displayName: instructor.displayName,
        profileImage: instructor.profileImage,
        bio: instructor.bio
      } : null,
      enrollmentCount
    };

    res.json({ course });
  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({ error: 'Error fetching course' });
  }
});

// Create new course (teacher/admin only)
router.post('/', verifyFirebaseToken, checkRole(['teacher', 'admin']), async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      level,
      duration,
      price,
      isPublic = true,
      thumbnail,
      tags = []
    } = req.body;

    if (!title || !description || !category || !level) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    const courseData = {
      title,
      description,
      category,
      level,
      duration: duration || null,
      price: price || 0,
      isPublic,
      thumbnail: thumbnail || null,
      tags,
      createdBy: req.user.uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft',
      modules: [],
      assignments: [],
      enrolledStudents: 0,
      rating: 0,
      totalRatings: 0
    };

    const id = generateId('course');
    await courseRef(id).set({ id, ...courseData });

    res.status(201).json({
      message: 'Course created successfully',
      course: {
        id,
        ...courseData,
      }
    });
  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({ error: 'Error creating course' });
  }
});

// Update course (owner or admin only)
router.put('/:id', verifyFirebaseToken, checkOwnership('course'), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      updatedAt: new Date().toISOString()
    };

    await courseRef(id).update(updateData);
    const updatedSnap = await courseRef(id).get();
    res.json({
      message: 'Course updated successfully',
      course: {
        id,
        ...(updatedSnap.exists() ? updatedSnap.val() : {})
      }
    });
  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({ error: 'Error updating course' });
  }
});

// Delete course (owner or admin only)
router.delete('/:id', verifyFirebaseToken, checkOwnership('course'), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if course has enrollments
    const enrollSnap = await enrollmentsRef().orderByChild('courseId').equalTo(id).get();
    if (enrollSnap.exists()) {
      return res.status(400).json({ 
        error: 'Cannot delete course with active enrollments' 
      });
    }

    await courseRef(id).remove();

    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({ error: 'Error deleting course' });
  }
});

// Enroll in course (students only)
router.post('/:id/enroll', verifyFirebaseToken, checkRole(['student']), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.uid;

    // Check if course exists
    const courseSnap = await courseRef(id).get();
    if (!courseSnap.exists()) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check if already enrolled
    const existingSnap = await enrollmentsRef().orderByChild('studentId').equalTo(userId).get();
    if (existingSnap.exists()) {
      const existing = existingSnap.val() || {};
      const already = Object.values(existing).some((e) => e && e.courseId === id);
      if (already) {
      return res.status(400).json({ error: 'Already enrolled in this course' });
    }
    }

    // Create enrollment
    const enrollmentData = {
      courseId: id,
      studentId: userId,
      enrolledAt: new Date().toISOString(),
      status: 'active',
      progress: 0,
      completedModules: [],
      completedAssignments: []
    };

    const enrollId = generateId('enroll');
    await db.ref(`enrollments/${enrollId}`).set({ id: enrollId, ...enrollmentData });

    // Update course enrollment count atomically
    await db.ref(`courses/${id}/enrolledStudents`).transaction((cur) => (Number(cur || 0) + 1));

    res.status(201).json({ message: 'Enrolled successfully' });
  } catch (error) {
    console.error('Enroll error:', error);
    res.status(500).json({ error: 'Error enrolling in course' });
  }
});

// Get course enrollments (instructor/admin only)
router.get('/:id/enrollments', verifyFirebaseToken, checkOwnership('course'), async (req, res) => {
  try {
    const { id } = req.params;

    const enrollSnap = await enrollmentsRef().orderByChild('courseId').equalTo(id).get();
    const enrollmentsRaw = enrollSnap.exists() ? enrollSnap.val() : {};
    const enrollments = [];

    for (const [enrollId, enrollmentData] of Object.entries(enrollmentsRaw || {})) {
      const e = enrollmentData || {};
      const studentSnap = e.studentId ? await usersRef(e.studentId).get() : null;
      const student = studentSnap && studentSnap.exists() ? studentSnap.val() : null;
      enrollments.push({
        id: enrollId,
        ...e,
        student: student ? {
          displayName: student.displayName,
          email: student.email,
          profileImage: student.profileImage
        } : null
      });
    }

    res.json({ enrollments });
  } catch (error) {
    console.error('Get enrollments error:', error);
    res.status(500).json({ error: 'Error fetching enrollments' });
  }
});

module.exports = router;
