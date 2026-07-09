import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { appToast } from '../contexts/HybridAlertContext';

const CourseDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCourse = async () => {
      try {
        const response = await axios.get(`/api/courses/${id}`);
        setCourse(response.data.course);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch course details');
        setLoading(false);
      }
    };

    fetchCourse();
  }, [id]);

  const handleEnroll = async () => {
    try {
      await axios.post(`/api/courses/${id}/enroll`);
      appToast.success('Successfully enrolled in course!');
    } catch (err) {
      appToast.error('Failed to enroll in course');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-500 py-8">
        {error}
      </div>
    );
  }

  if (!course) {
    return (
      <div className="text-center text-gray-500 py-8">
        Course not found
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <button 
        onClick={() => navigate(-1)}
        className="mb-6 text-primary hover:text-primary-dark"
      >
        ← Back to Courses
      </button>

      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="p-8">
          <h1 className="text-3xl font-bold mb-4">{course.title}</h1>
          
          <div className="flex items-center gap-4 mb-6">
            <span className="bg-primary-light text-primary-dark px-3 py-1 rounded-full text-sm">
              {course.level}
            </span>
            <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm">
              {course.category}
            </span>
            <span className="text-lg font-bold text-secondary">
              ${course.price || 'Free'}
            </span>
          </div>

          <p className="text-gray-700 mb-8 text-lg leading-relaxed">
            {course.description}
          </p>

          <div className="border-t pt-6">
            <h2 className="text-xl font-semibold mb-4">Course Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="font-medium text-gray-600">Instructor</h3>
                <p className="text-gray-800">{course.instructor || 'TBD'}</p>
              </div>
              <div>
                <h3 className="font-medium text-gray-600">Duration</h3>
                <p className="text-gray-800">{course.duration || 'Self-paced'}</p>
              </div>
              <div>
                <h3 className="font-medium text-gray-600">Students Enrolled</h3>
                <p className="text-gray-800">{course.enrolledCount || 0}</p>
              </div>
              <div>
                <h3 className="font-medium text-gray-600">Rating</h3>
                <p className="text-gray-800">{course.rating || 'Not rated'}</p>
              </div>
            </div>
          </div>

          <div className="mt-8 flex gap-4">
            <button 
              onClick={handleEnroll}
              className="bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary-dark font-medium"
            >
              Enroll Now
            </button>
            <button className="border border-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-100 font-medium">
              Add to Wishlist
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourseDetail;
