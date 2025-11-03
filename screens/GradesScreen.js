import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, RefreshControl, Modal, TextInput, ActivityIndicator, Linking, Image } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import * as Sharing from 'expo-sharing';

// Import Firebase with error handling
let db = null;
let auth = null;
try {
  const firebase = require('../firebase');
  db = firebase.db;
  auth = firebase.auth;
} catch (error) {
  console.log('Firebase not available:', error);
}

export default function GradesScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { classInfo, classCode, userRole: passedUserRole } = route.params || {};
  
  const [currentClassInfo, setCurrentClassInfo] = useState(classInfo || null);
  
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(passedUserRole || null);
  const [grades, setGrades] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [overallStats, setOverallStats] = useState({
    totalPoints: 0,
    earnedPoints: 0,
    percentage: 0,
    gradedAssignments: 0,
    totalAssignments: 0
  });

  // Instructor-specific state
  const [classStats, setClassStats] = useState({
    totalStudents: 0,
    averageGrade: 0,
    submissionRate: 0,
    gradingProgress: 0
  });
  const [assignmentStats, setAssignmentStats] = useState([]);
  const [studentOverview, setStudentOverview] = useState([]);
  const [allSubmissions, setAllSubmissions] = useState([]); // For tracking all submissions
  
  // Grading Modal State
  const [showGradingModal, setShowGradingModal] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [gradeInput, setGradeInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');
  const [isGrading, setIsGrading] = useState(false);
  const [isEditingGrade, setIsEditingGrade] = useState(false); // New state for edit mode
  
  // Score Summary Modal State
  const [selectedStudentSummary, setSelectedStudentSummary] = useState(null);
  
  // View Toggle State
  const [activeView, setActiveView] = useState('assignments'); // 'assignments' or 'students'

  // Fetch user role from Firestore
  const fetchUserRole = async (user) => {
    if (user && db) {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setUserRole(userDoc.data().role);
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
      }
    }
  };

  const fetchClassInfo = async () => {
    if (!classCode || !db) return;
    
    try {
      console.log('Fetching class info for classCode:', classCode);
      const classesRef = collection(db, 'classes');
      const classQuery = query(classesRef, where('code', '==', classCode));
      const classSnapshot = await getDocs(classQuery);
      
      if (!classSnapshot.empty) {
        const classData = {
          id: classSnapshot.docs[0].id,
          ...classSnapshot.docs[0].data()
        };
        console.log('Found class info:', classData);
        setCurrentClassInfo(classData);
      } else {
        console.log('No class found with code:', classCode);
      }
    } catch (error) {
      console.error('Error fetching class info:', error);
    }
  };

  const fetchGrades = async () => {
    const targetClassInfo = currentClassInfo;
    if (!targetClassInfo?.id || !currentUser || !db) {
      console.log('Missing required data for fetching grades');
      return;
    }

    try {
      setIsLoading(true);

      // Fetch all assignments for this class
      const assignmentsRef = collection(db, 'classes', targetClassInfo.id, 'assignments');
      const assignmentsSnapshot = await getDocs(assignmentsRef);
      const assignmentsData = assignmentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setAssignments(assignmentsData);

      if (userRole === 'student') {
        // For students, fetch their submissions and grades
        const submissionsRef = collection(db, 'classes', targetClassInfo.id, 'submissions');
        const studentSubmissionsQuery = query(submissionsRef, where('studentId', '==', currentUser.uid));
        const submissionsSnapshot = await getDocs(studentSubmissionsQuery);
        
        const submissionsData = submissionsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Combine assignments with submission data
        const gradesData = assignmentsData.map(assignment => {
          const submission = submissionsData.find(sub => sub.assignmentId === assignment.id);
          return {
            assignment,
            submission: submission || null,
            isSubmitted: !!submission,
            grade: submission?.grade || null,
            feedback: submission?.feedback || null,
            submittedAt: submission?.submittedAt || null,
            gradedAt: submission?.gradedAt || null
          };
        });

        setGrades(gradesData);
        calculateOverallStats(gradesData);
      } else {
        // For instructors, fetch class-wide statistics
        await fetchInstructorGradebookWithAssignments(assignmentsData);
      }

    } catch (error) {
      console.error('Error fetching grades:', error);
      Alert.alert('Error', 'Failed to load grades');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const fetchInstructorGradebook = async () => {
    try {
      console.log('fetchInstructorGradebook called');
      console.log('classInfo:', classInfo);
      console.log('assignments:', assignments);
      
      // Get all students in the class
      const classDoc = await getDoc(doc(db, 'classes', classInfo.id));
      const classData = classDoc.data();
      console.log('classData:', classData);
      
      const studentIds = classData?.students || [];
      console.log('studentIds:', studentIds);
      
      // Fetch all submissions for this class
      const submissionsRef = collection(db, 'classes', classInfo.id, 'submissions');
      const submissionsSnapshot = await getDocs(submissionsRef);
      const allSubmissions = submissionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log('allSubmissions:', allSubmissions);

      // Calculate assignment statistics
      const assignmentStatsData = assignments.map(assignment => {
        const assignmentSubmissions = allSubmissions.filter(sub => sub.assignmentId === assignment.id);
        const gradedSubmissions = assignmentSubmissions.filter(sub => sub.grade !== null && sub.grade !== undefined);
        const totalPoints = parseInt(assignment.points) || 0;
        const averageGrade = gradedSubmissions.length > 0 
          ? gradedSubmissions.reduce((sum, sub) => sum + (parseFloat(sub.grade) || 0), 0) / gradedSubmissions.length 
          : 0;
        
        return {
          ...assignment,
          submissionCount: assignmentSubmissions.length,
          gradedCount: gradedSubmissions.length,
          submissionRate: studentIds.length > 0 ? (assignmentSubmissions.length / studentIds.length) * 100 : 0,
          averageGrade: averageGrade,
          averagePercentage: totalPoints > 0 ? (averageGrade / totalPoints) * 100 : 0
        };
      });

      console.log('assignmentStatsData:', assignmentStatsData);
      setAssignmentStats(assignmentStatsData);

      // Calculate overall class statistics
      const totalSubmissions = allSubmissions.length;
      const gradedSubmissions = allSubmissions.filter(sub => sub.grade !== null && sub.grade !== undefined);
      const totalPossibleSubmissions = assignments.length * studentIds.length;
      
      const classStatsData = {
        totalStudents: studentIds.length,
        averageGrade: gradedSubmissions.length > 0 
          ? gradedSubmissions.reduce((sum, sub) => sum + (parseFloat(sub.grade) || 0), 0) / gradedSubmissions.length 
          : 0,
        submissionRate: totalPossibleSubmissions > 0 ? (totalSubmissions / totalPossibleSubmissions) * 100 : 0,
        gradingProgress: totalSubmissions > 0 ? (gradedSubmissions.length / totalSubmissions) * 100 : 0
      };

      setClassStats(classStatsData);

      // Fetch student overview data
      const studentOverviewData = await Promise.all(
        studentIds.map(async (studentId) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', studentId));
            const userData = userDoc.data();
            const studentSubmissions = allSubmissions.filter(sub => sub.studentId === studentId);
            const gradedSubmissions = studentSubmissions.filter(sub => sub.grade !== null && sub.grade !== undefined);
            
            const totalPoints = assignments.reduce((sum, assignment) => sum + (parseInt(assignment.points) || 0), 0);
            const earnedPoints = gradedSubmissions.reduce((sum, sub) => sum + (parseFloat(sub.grade) || 0), 0);
            
            return {
              id: studentId,
              name: userData?.name || 'Unknown Student',
              email: userData?.email || '',
              submissionsCount: studentSubmissions.length,
              gradedCount: gradedSubmissions.length,
              totalPoints: totalPoints,
              earnedPoints: earnedPoints,
              percentage: totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0
            };
          } catch (error) {
            console.error('Error fetching student data:', error);
            return {
              id: studentId,
              name: 'Unknown Student',
              email: '',
              submissionsCount: 0,
              gradedCount: 0,
              totalPoints: 0,
              earnedPoints: 0,
              percentage: 0
            };
          }
        })
      );

      setStudentOverview(studentOverviewData);

    } catch (error) {
      console.error('Error fetching instructor gradebook:', error);
    }
  };

  const fetchInstructorGradebookWithAssignments = async (assignmentsData) => {
    try {
      // Get all students in the class
      const classDoc = await getDoc(doc(db, 'classes', currentClassInfo.id));
      const classData = classDoc.data();
      const studentIds = classData?.students || [];
      
      // Fetch all submissions for this class
      const submissionsRef = collection(db, 'classes', currentClassInfo.id, 'submissions');
      const submissionsSnapshot = await getDocs(submissionsRef);
      const allSubmissions = submissionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Set submissions in state for quick grade access
      setAllSubmissions(allSubmissions);

      // Calculate assignment statistics
      const assignmentStatsData = assignmentsData.map(assignment => {
        const assignmentSubmissions = allSubmissions.filter(sub => sub.assignmentId === assignment.id);
        const gradedSubmissions = assignmentSubmissions.filter(sub => sub.grade !== null && sub.grade !== undefined);
        const totalPoints = parseInt(assignment.points) || 0;
        const averageGrade = gradedSubmissions.length > 0 
          ? gradedSubmissions.reduce((sum, sub) => sum + (parseFloat(sub.grade) || 0), 0) / gradedSubmissions.length 
          : 0;
        
        return {
          ...assignment,
          submissionCount: assignmentSubmissions.length,
          gradedCount: gradedSubmissions.length,
          submissionRate: studentIds.length > 0 ? (assignmentSubmissions.length / studentIds.length) * 100 : 0,
          averageGrade: averageGrade,
          averagePercentage: totalPoints > 0 ? (averageGrade / totalPoints) * 100 : 0
        };
      });

      console.log('assignmentStatsData:', assignmentStatsData);
      setAssignmentStats(assignmentStatsData);

      // Calculate overall class statistics
      const totalSubmissions = allSubmissions.length;
      const gradedSubmissions = allSubmissions.filter(sub => sub.grade !== null && sub.grade !== undefined);
      const totalPossibleSubmissions = assignmentsData.length * studentIds.length;
      
      const classStatsData = {
        totalStudents: studentIds.length,
        averageGrade: gradedSubmissions.length > 0 
          ? gradedSubmissions.reduce((sum, sub) => sum + (parseFloat(sub.grade) || 0), 0) / gradedSubmissions.length 
          : 0,
        submissionRate: totalPossibleSubmissions > 0 ? (totalSubmissions / totalPossibleSubmissions) * 100 : 0,
        gradingProgress: totalSubmissions > 0 ? (gradedSubmissions.length / totalSubmissions) * 100 : 0
      };

      console.log('classStatsData:', classStatsData);
      setClassStats(classStatsData);

      // Fetch student overview data
      const studentOverviewData = await Promise.all(
        studentIds.map(async (studentId) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', studentId));
            const userData = userDoc.data();
            const studentSubmissions = allSubmissions.filter(sub => sub.studentId === studentId);
            const gradedSubmissions = studentSubmissions.filter(sub => sub.grade !== null && sub.grade !== undefined);
            
            const totalPoints = assignmentsData.reduce((sum, assignment) => sum + (parseInt(assignment.points) || 0), 0);
            const earnedPoints = gradedSubmissions.reduce((sum, sub) => sum + (parseFloat(sub.grade) || 0), 0);
            
            return {
              id: studentId,
              name: userData?.name || 'Unknown Student',
              email: userData?.email || '',
              submissionsCount: studentSubmissions.length,
              gradedCount: gradedSubmissions.length,
              totalPoints: totalPoints,
              earnedPoints: earnedPoints,
              percentage: totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0
            };
          } catch (error) {
            console.error('Error fetching student data:', error);
            return {
              id: studentId,
              name: 'Unknown Student',
              email: '',
              submissionsCount: 0,
              gradedCount: 0,
              totalPoints: 0,
              earnedPoints: 0,
              percentage: 0
            };
          }
        })
      );

      console.log('studentOverviewData:', studentOverviewData);
      setStudentOverview(studentOverviewData);

    } catch (error) {
      console.error('Error fetching instructor gradebook with assignments:', error);
    }
  };

  const openGradingModal = async (studentId, assignmentId) => {
    try {
      // Find the assignment
      const assignment = assignments.find(a => a.id === assignmentId);
      if (!assignment) {
        Alert.alert('Error', 'Assignment not found');
        return;
      }

      // Find the submission
      const submissionsRef = collection(db, 'classes', currentClassInfo.id, 'submissions');
      const submissionQuery = query(
        submissionsRef,
        where('studentId', '==', studentId),
        where('assignmentId', '==', assignmentId)
      );
      
      const submissionSnapshot = await getDocs(submissionQuery);
      let submission = null;
      
      if (!submissionSnapshot.empty) {
        submission = {
          id: submissionSnapshot.docs[0].id,
          ...submissionSnapshot.docs[0].data()
        };
      }

      // Get student info
      const studentDoc = await getDoc(doc(db, 'users', studentId));
      const studentData = studentDoc.data();

      setSelectedAssignment(assignment);
      setSelectedSubmission({
        ...submission,
        studentName: studentData?.name || 'Unknown Student',
        studentEmail: studentData?.email || ''
      });
      setGradeInput(submission?.grade || '');
      setFeedbackInput(submission?.feedback || '');
      
      // Set edit mode based on whether submission is already graded
      const isAlreadyGraded = submission && (submission.grade !== null && submission.grade !== undefined);
      setIsEditingGrade(!isAlreadyGraded); // Start in edit mode if not graded, view mode if graded
      
      setShowGradingModal(true);
    } catch (error) {
      console.error('Error opening grading modal:', error);
      Alert.alert('Error', 'Failed to load submission');
    }
  };

  const handleGradeSubmission = async () => {
    if (!selectedSubmission || !selectedAssignment) return;

    try {
      setIsGrading(true);

      const grade = parseFloat(gradeInput);
      const maxPoints = parseFloat(selectedAssignment.points);

      if (isNaN(grade) || grade < 0 || grade > maxPoints) {
        Alert.alert('Invalid Grade', `Please enter a grade between 0 and ${maxPoints}`);
        return;
      }

      if (selectedSubmission.id) {
        // Update existing submission
        const submissionRef = doc(db, 'classes', currentClassInfo.id, 'submissions', selectedSubmission.id);
        await updateDoc(submissionRef, {
          grade: grade,
          feedback: feedbackInput.trim(),
          gradedAt: new Date(),
          gradedBy: currentUser.uid
        });
      } else {
        // Create new submission record (if student submitted but no grade record exists)
        const submissionsRef = collection(db, 'classes', currentClassInfo.id, 'submissions');
        await setDoc(doc(submissionsRef), {
          studentId: selectedSubmission.studentId || currentUser.uid,
          assignmentId: selectedAssignment.id,
          grade: grade,
          feedback: feedbackInput.trim(),
          gradedAt: new Date(),
          gradedBy: currentUser.uid,
          submittedAt: new Date() // Default if no submission exists
        });
      }

      Alert.alert('Success', 'Grade saved successfully!');
      setShowGradingModal(false);
      
      // Refresh the gradebook data
      await fetchGrades();
      
    } catch (error) {
      console.error('Error grading submission:', error);
      Alert.alert('Error', 'Failed to save grade');
    } finally {
      setIsGrading(false);
    }
  };

  const handleViewAttachment = async (attachment) => {
    try {
      if (attachment.type === 'image') {
        // For images, we can show them in a modal or open them
        Alert.alert('Image Preview', 'Image will open in your default viewer');
        await Linking.openURL(attachment.uri);
      } else {
        // For files, try to share or open them
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(attachment.uri);
        } else {
          await Linking.openURL(attachment.uri);
        }
      }
    } catch (error) {
      console.error('Error viewing attachment:', error);
      Alert.alert('Error', 'Could not open attachment');
    }
  };

  const calculateOverallStats = (gradesData) => {
    let totalPoints = 0;
    let earnedPoints = 0;
    let gradedCount = 0;

    gradesData.forEach(item => {
      const assignmentPoints = parseInt(item.assignment.points) || 0;
      totalPoints += assignmentPoints;
      
      if (item.grade !== null && item.grade !== undefined) {
        earnedPoints += parseInt(item.grade) || 0;
        gradedCount++;
      }
    });

    const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

    setOverallStats({
      totalPoints,
      earnedPoints,
      percentage,
      gradedAssignments: gradedCount,
      totalAssignments: gradesData.length
    });
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchGrades();
  }, [classInfo, currentUser, userRole]);

  const formatDate = (date) => {
    if (!date) return 'Not submitted';
    
    let dateObj;
    if (date.toDate) {
      dateObj = date.toDate();
    } else {
      dateObj = new Date(date);
    }
    
    return dateObj.toLocaleDateString();
  };

  const getGradeStatus = (item) => {
    if (!item.isSubmitted) return { status: 'Not Submitted', color: '#dc3545', icon: '❌' };
    if (item.grade === null || item.grade === undefined) return { status: 'Pending Review', color: '#ffc107', icon: '⏳' };
    return { status: 'Graded', color: '#28a745', icon: '✅' };
  };

  const getGradePercentage = (grade, totalPoints) => {
    if (!grade || !totalPoints) return 0;
    return Math.round((grade / totalPoints) * 100);
  };

  useEffect(() => {
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        setCurrentUser(user);
        if (user) {
          fetchUserRole(user);
        } else {
          setUserRole(null);
        }
      });
      
      return unsubscribe;
    }
  }, []);

  // Fetch class info if only classCode is provided
  useEffect(() => {
    if (classCode && !currentClassInfo) {
      fetchClassInfo();
    }
  }, [classCode, currentClassInfo]);

  useFocusEffect(
    useCallback(() => {
      if (currentUser && userRole && currentClassInfo) {
        fetchGrades();
      }
    }, [currentUser, userRole, currentClassInfo])
  );

  // If no class info is provided, show a selection message
  if (!currentClassInfo) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.title}>Gradebook</Text>
            <Text style={styles.subtitle}>Select a class</Text>
          </View>
        </View>

        <View style={styles.noClassContainer}>
          <Text style={styles.noClassIcon}>📚</Text>
          <Text style={styles.noClassTitle}>No Class Selected</Text>
          <Text style={styles.noClassText}>
            Please select a class first to view the gradebook.
          </Text>
          <TouchableOpacity 
            style={styles.selectClassButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.selectClassButtonText}>Go Back to Classes</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (userRole === 'instructor') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.title}>Instructor Gradebook</Text>
            <Text style={styles.subtitle}>{currentClassInfo?.name || 'Class Gradebook'}</Text>
          </View>
        </View>

        <ScrollView 
          style={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* View Toggle Buttons */}
          <View style={styles.toggleContainer}>
            <TouchableOpacity 
              style={[
                styles.toggleButton, 
                activeView === 'assignments' ? styles.activeToggleButton : styles.inactiveToggleButton
              ]}
              onPress={() => setActiveView('assignments')}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.toggleButtonText,
                activeView === 'assignments' ? styles.activeToggleButtonText : styles.inactiveToggleButtonText
              ]}>
                📝 Assignment Overview
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.toggleButton,
                activeView === 'students' ? styles.activeToggleButton : styles.inactiveToggleButton
              ]}
              onPress={() => setActiveView('students')}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.toggleButtonText,
                activeView === 'students' ? styles.activeToggleButtonText : styles.inactiveToggleButtonText
              ]}>
                👥 Student Performance
              </Text>
            </TouchableOpacity>
          </View>

          {/* Assignment Statistics */}
          {activeView === 'assignments' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Assignment Overview</Text>
              <TouchableOpacity 
                style={styles.viewAllButton}
                onPress={() => navigation.navigate('Assignments', {
                  classInfo: currentClassInfo,
                  userRole: userRole
                })}
              >
                <Text style={styles.viewAllText}>Grade Assignments</Text>
              </TouchableOpacity>
            </View>
            
            {assignmentStats.map((assignment, index) => (
              <View key={assignment.id} style={styles.assignmentStatCard}>
                <View style={styles.assignmentHeader}>
                  <View style={styles.assignmentInfo}>
                    <Text style={styles.assignmentTitle}>{assignment.title}</Text>
                    <Text style={styles.assignmentDueDate}>
                      Due: {formatDate(assignment.dueDate)} • {assignment.points} pts
                    </Text>
                  </View>
                  <View style={styles.assignmentStats}>
                    <Text style={styles.assignmentAverage}>
                      {Math.round(assignment.averagePercentage)}%
                    </Text>
                    <Text style={styles.assignmentAvgLabel}>Average</Text>
                  </View>
                </View>
                
                <View style={styles.assignmentProgress}>
                  <View style={styles.progressItem}>
                    <Text style={styles.progressLabel}>
                      Submitted: {assignment.submissionCount}/{classStats.totalStudents}
                    </Text>
                    <View style={styles.progressBar}>
                      <View 
                        style={[
                          styles.progressFill, 
                          { width: `${assignment.submissionRate}%` }
                        ]} 
                      />
                    </View>
                  </View>
                  
                  <View style={styles.progressItem}>
                    <Text style={styles.progressLabel}>
                      Graded: {assignment.gradedCount}/{assignment.submissionCount}
                    </Text>
                    <View style={styles.progressBar}>
                      <View 
                        style={[
                          styles.progressFill, 
                          { 
                            width: assignment.submissionCount > 0 
                              ? `${(assignment.gradedCount / assignment.submissionCount) * 100}%` 
                              : '0%',
                            backgroundColor: '#28a745'
                          }
                        ]} 
                      />
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Student Performance Section */}
        {activeView === 'students' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Student Performance</Text>
            
            {studentOverview.map((student, index) => (
              <View key={student.id} style={styles.studentCard}>
                <View style={styles.studentHeader}>
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName}>{student.name}</Text>
                    <Text style={styles.studentEmail}>{student.email}</Text>
                  </View>
                  <View style={styles.studentGrade}>
                    <Text style={styles.studentPercentage}>
                      {Math.round(student.percentage)}%
                    </Text>
                    <Text style={styles.studentPoints}>
                      {student.earnedPoints}/{student.totalPoints} pts
                    </Text>
                  </View>
                </View>
                
                <View style={styles.studentProgress}>
                  <Text style={styles.studentProgressText}>
                    Submissions: {student.submissionsCount}/{assignments.length} • 
                    Graded: {student.gradedCount}/{student.submissionsCount}
                  </Text>
                  <View style={styles.progressBar}>
                    <View 
                      style={[
                        styles.progressFill, 
                        { width: `${student.percentage}%` }
                      ]} 
                    />
                  </View>
                </View>
                
                {/* Assignment Grading Section */}
                <View style={styles.studentAssignments}>
                  <View style={styles.assignmentHeader}>
                    <Text style={styles.assignmentsTitle}>Quick Grade:</Text>
                    <TouchableOpacity 
                      style={styles.scoreSummaryButton}
                      onPress={() => setSelectedStudentSummary(student)}
                    >
                      <Text style={styles.scoreSummaryButtonText}>📊 Score Summary</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.assignmentsList}>
                    {assignments.map((assignment) => {
                      // Check if student has submitted this assignment
                      const hasSubmission = allSubmissions?.some(sub => 
                        sub.studentId === student.id && sub.assignmentId === assignment.id
                      );
                      
                      // Check if the submission is graded
                      const submission = allSubmissions?.find(sub => 
                        sub.studentId === student.id && sub.assignmentId === assignment.id
                      );
                      const isGraded = submission && (submission.grade !== null && submission.grade !== undefined);
                      
                      return (
                        <TouchableOpacity
                          key={assignment.id}
                          style={[
                            styles.assignmentQuickGrade,
                            !hasSubmission && styles.assignmentQuickGradeDisabled,
                            hasSubmission && isGraded && styles.assignmentQuickGradeGraded,
                            hasSubmission && !isGraded && styles.assignmentQuickGradeToBeGraded
                          ]}
                          onPress={() => hasSubmission && openGradingModal(student.id, assignment.id)}
                          disabled={!hasSubmission}
                          activeOpacity={hasSubmission ? 0.7 : 1}
                        >
                          <Text style={[
                            styles.assignmentQuickTitle,
                            !hasSubmission && styles.assignmentQuickTitleDisabled
                          ]}>
                            {assignment.title}
                          </Text>
                          <Text style={[
                            styles.assignmentQuickPoints,
                            !hasSubmission && styles.assignmentQuickPointsDisabled
                          ]}>
                            {assignment.points} pts
                          </Text>
                          {!hasSubmission && (
                            <Text style={styles.noSubmissionText}>No submission</Text>
                          )}
                          {hasSubmission && isGraded && (
                            <Text style={styles.gradedText}>✓ Graded</Text>
                          )}
                          {hasSubmission && !isGraded && (
                            <Text style={styles.toBeGradedText}>To be graded</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            ))}
          </View>
        )}
        </ScrollView>

        {/* Grading Modal */}
        <Modal
          visible={showGradingModal}
          animationType="slide"
          presentationStyle="pageSheet"
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowGradingModal(false)} style={styles.modalCloseButton}>
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Grade Submission</Text>
              {isEditingGrade && (
                <TouchableOpacity onPress={handleGradeSubmission} disabled={isGrading} style={styles.modalSaveButton}>
                  {isGrading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.modalSaveText}>Save</Text>
                  )}
                </TouchableOpacity>
              )}
              {!isEditingGrade && (
                <View style={styles.modalSaveButton} />
              )}
            </View>

            <ScrollView style={styles.modalContent}>
              {/* Assignment Info */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Assignment</Text>
                <Text style={styles.assignmentTitle}>{selectedAssignment?.title}</Text>
                <Text style={styles.assignmentDetails}>
                  Due: {formatDate(selectedAssignment?.dueDate)} • {selectedAssignment?.points} points
                </Text>
              </View>

              {/* Student Info */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Student</Text>
                <Text style={styles.studentName}>{selectedSubmission?.studentName}</Text>
                <Text style={styles.studentEmail}>{selectedSubmission?.studentEmail}</Text>
              </View>

              {/* Submission Content */}
              {selectedSubmission && (
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Submission</Text>
                  {selectedSubmission.submissionText && (
                    <View style={styles.submissionTextContainer}>
                      <Text style={styles.submissionLabel}>Text Submission:</Text>
                      <Text style={styles.submissionText}>{selectedSubmission.submissionText}</Text>
                    </View>
                  )}

                  {/* Attached Files */}
                  {selectedSubmission.attachedFiles && selectedSubmission.attachedFiles.length > 0 && (
                    <View style={styles.attachmentsContainer}>
                      <Text style={styles.submissionLabel}>Attached Files:</Text>
                      {selectedSubmission.attachedFiles.map((file, index) => (
                        <TouchableOpacity
                          key={index}
                          style={styles.attachmentItem}
                          onPress={() => handleViewAttachment(file)}
                        >
                          <Text style={styles.attachmentIcon}>📎</Text>
                          <Text style={styles.attachmentName}>{file.name}</Text>
                          <Text style={styles.attachmentAction}>Tap to view</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Attached Images */}
                  {selectedSubmission.attachedImages && selectedSubmission.attachedImages.length > 0 && (
                    <View style={styles.attachmentsContainer}>
                      <Text style={styles.submissionLabel}>Attached Images:</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {selectedSubmission.attachedImages.map((image, index) => (
                          <TouchableOpacity
                            key={index}
                            style={styles.imageAttachment}
                            onPress={() => handleViewAttachment(image)}
                          >
                            <Image source={{ uri: image.uri }} style={styles.attachedImage} />
                            <Text style={styles.imageAttachmentName}>{image.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {selectedSubmission.submittedAt && (
                    <Text style={styles.submissionTime}>
                      Submitted: {formatDate(selectedSubmission.submittedAt)}
                    </Text>
                  )}
                </View>
              )}

              {/* Grading Section */}
              <View style={styles.modalSection}>
                <View style={styles.gradingSectionHeader}>
                  <Text style={styles.modalSectionTitle}>Grading</Text>
                  {!isEditingGrade && selectedSubmission?.grade !== null && selectedSubmission?.grade !== undefined && (
                    <TouchableOpacity 
                      style={styles.editButton}
                      onPress={() => setIsEditingGrade(true)}
                    >
                      <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>
                  )}
                </View>
                
                {isEditingGrade ? (
                  // Edit Mode - Show input fields
                  <>
                    <View style={styles.gradeInputContainer}>
                      <Text style={styles.inputLabel}>Grade (out of {selectedAssignment?.points} points):</Text>
                      <TextInput
                        style={styles.gradeInput}
                        value={gradeInput}
                        onChangeText={setGradeInput}
                        placeholder="Enter grade"
                        keyboardType="numeric"
                      />
                    </View>

                    <View style={styles.feedbackInputContainer}>
                      <Text style={styles.inputLabel}>Feedback:</Text>
                      <TextInput
                        style={styles.feedbackInput}
                        value={feedbackInput}
                        onChangeText={setFeedbackInput}
                        placeholder="Enter feedback for the student..."
                        multiline
                        numberOfLines={4}
                      />
                    </View>
                    
                    {selectedSubmission?.grade !== null && selectedSubmission?.grade !== undefined && (
                      <TouchableOpacity 
                        style={styles.cancelEditButton}
                        onPress={() => {
                          setIsEditingGrade(false);
                          setGradeInput(selectedSubmission?.grade || '');
                          setFeedbackInput(selectedSubmission?.feedback || '');
                        }}
                      >
                        <Text style={styles.cancelEditButtonText}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  // View Mode - Show existing grade
                  <View style={styles.gradeDisplayContainer}>
                    <View style={styles.gradeDisplay}>
                      <Text style={styles.gradeDisplayLabel}>Grade:</Text>
                      <Text style={styles.gradeDisplayValue}>
                        {selectedSubmission?.grade || 'Not graded'} / {selectedAssignment?.points} points
                      </Text>
                    </View>
                    
                    {selectedSubmission?.feedback && (
                      <View style={styles.feedbackDisplay}>
                        <Text style={styles.feedbackDisplayLabel}>Feedback:</Text>
                        <Text style={styles.feedbackDisplayValue}>{selectedSubmission.feedback}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </Modal>

        {/* Score Summary Modal */}
        <Modal
          visible={!!selectedStudentSummary}
          animationType="slide"
          presentationStyle="pageSheet"
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setSelectedStudentSummary(null)} style={styles.modalCloseButton}>
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Score Summary</Text>
              <View style={styles.modalSaveButton} />
            </View>

            <ScrollView style={styles.modalContent}>
              {/* Student Info */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Student</Text>
                <Text style={styles.studentName}>{selectedStudentSummary?.name}</Text>
                <Text style={styles.studentEmail}>{selectedStudentSummary?.email}</Text>
              </View>

              {/* Overall Performance */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Overall Performance</Text>
                <View style={styles.overallStatsContainer}>
                  <View style={styles.overallStatItem}>
                    <Text style={styles.overallStatValue}>{Math.round(selectedStudentSummary?.percentage || 0)}%</Text>
                    <Text style={styles.overallStatLabel}>Overall Grade</Text>
                  </View>
                  <View style={styles.overallStatItem}>
                    <Text style={styles.overallStatValue}>{selectedStudentSummary?.earnedPoints || 0}</Text>
                    <Text style={styles.overallStatLabel}>Points Earned</Text>
                  </View>
                  <View style={styles.overallStatItem}>
                    <Text style={styles.overallStatValue}>{selectedStudentSummary?.totalPoints || 0}</Text>
                    <Text style={styles.overallStatLabel}>Total Points</Text>
                  </View>
                </View>
              </View>

              {/* Assignment Breakdown */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Assignment Breakdown</Text>
                {assignments.map((assignment) => {
                  const submission = allSubmissions?.find(sub => 
                    sub.studentId === selectedStudentSummary?.id && sub.assignmentId === assignment.id
                  );
                  const isGraded = submission && (submission.grade !== null && submission.grade !== undefined);
                  const hasSubmission = !!submission;
                  
                  return (
                    <View key={assignment.id} style={styles.assignmentSummaryItem}>
                      <View style={styles.assignmentSummaryHeader}>
                        <Text style={styles.assignmentSummaryTitle}>{assignment.title}</Text>
                        <View style={styles.assignmentSummaryScore}>
                          {isGraded ? (
                            <>
                              <Text style={styles.assignmentScoreText}>
                                {submission.grade}/{assignment.points}
                              </Text>
                              <Text style={styles.assignmentPercentageText}>
                                ({Math.round((submission.grade / assignment.points) * 100)}%)
                              </Text>
                            </>
                          ) : hasSubmission ? (
                            <>
                              <Text style={styles.assignmentPendingScoreText}>
                                -/{assignment.points}
                              </Text>
                              <Text style={styles.assignmentPendingText}>Pending</Text>
                            </>
                          ) : (
                            <>
                              <Text style={styles.assignmentNotSubmittedScoreText}>
                                0/{assignment.points}
                              </Text>
                              <Text style={styles.assignmentNotSubmittedText}>Not Submitted</Text>
                            </>
                          )}
                        </View>
                      </View>
                      
                      <View style={styles.assignmentSummaryDetails}>
                        <Text style={styles.assignmentSummaryDue}>
                          Due: {new Date(assignment.dueDate?.seconds * 1000).toLocaleDateString()}
                        </Text>
                        <View style={[
                          styles.assignmentStatusBadge,
                          isGraded && styles.gradedBadge,
                          hasSubmission && !isGraded && styles.pendingBadge,
                          !hasSubmission && styles.notSubmittedBadge
                        ]}>
                          <Text style={[
                            styles.assignmentStatusText,
                            isGraded && styles.gradedBadgeText,
                            hasSubmission && !isGraded && styles.pendingBadgeText,
                            !hasSubmission && styles.notSubmittedBadgeText
                          ]}>
                            {isGraded ? '✓ Graded' : hasSubmission ? 'Submitted' : 'Not Submitted'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.title}>My Grades</Text>
          <Text style={styles.subtitle}>{currentClassInfo?.name || 'Class Grades'}</Text>
        </View>
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Overall Statistics */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Overall Performance</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{overallStats.percentage}%</Text>
              <Text style={styles.statLabel}>Average</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{overallStats.earnedPoints}</Text>
              <Text style={styles.statLabel}>Points Earned</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{overallStats.totalPoints}</Text>
              <Text style={styles.statLabel}>Total Points</Text>
            </View>
          </View>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${overallStats.percentage}%` }
              ]} 
            />
          </View>
          <Text style={styles.statsSubtext}>
            {overallStats.gradedAssignments} of {overallStats.totalAssignments} assignments graded
          </Text>
        </View>

        {/* Grades List */}
        <View style={styles.gradesSection}>
          <Text style={styles.sectionTitle}>Assignment Grades</Text>
          
          {grades.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>📝</Text>
              <Text style={styles.emptyStateTitle}>No assignments yet</Text>
              <Text style={styles.emptyStateText}>
                Your instructor hasn't posted any assignments yet.
              </Text>
            </View>
          ) : (
            grades.map((item, index) => {
              const gradeStatus = getGradeStatus(item);
              const percentage = getGradePercentage(item.grade, item.assignment.points);
              
              return (
                <View key={index} style={styles.gradeCard}>
                  <View style={styles.gradeHeader}>
                    <View style={styles.gradeTitle}>
                      <Text style={styles.assignmentTitle}>{item.assignment.title}</Text>
                      <Text style={styles.assignmentDueDate}>
                        Due: {formatDate(item.assignment.dueDate)}
                      </Text>
                    </View>
                    <View style={styles.gradeScore}>
                      {item.grade !== null && item.grade !== undefined ? (
                        <>
                          <Text style={styles.gradePoints}>
                            {item.grade}/{item.assignment.points}
                          </Text>
                          <Text style={styles.gradePercentage}>({percentage}%)</Text>
                        </>
                      ) : (
                        <Text style={styles.gradePoints}>
                          -/{item.assignment.points}
                        </Text>
                      )}
                    </View>
                  </View>
                  
                  <View style={styles.gradeDetails}>
                    <View style={[styles.statusBadge, { backgroundColor: gradeStatus.color + '20' }]}>
                      <Text style={[styles.statusText, { color: gradeStatus.color }]}>
                        {gradeStatus.icon} {gradeStatus.status}
                      </Text>
                    </View>
                    
                    {item.submittedAt && (
                      <Text style={styles.submissionDate}>
                        Submitted: {formatDate(item.submittedAt)}
                      </Text>
                    )}
                    
                    {item.gradedAt && (
                      <Text style={styles.gradedDate}>
                        Graded: {formatDate(item.gradedAt)}
                      </Text>
                    )}
                  </View>
                  
                  {item.feedback && (
                    <View style={styles.feedbackSection}>
                      <Text style={styles.feedbackLabel}>Feedback:</Text>
                      <Text style={styles.feedbackText}>{item.feedback}</Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 16,
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  backButton: {
    padding: 8,
  },
  backIcon: {
    fontSize: 24,
    color: '#333',
    fontWeight: 'bold',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  
  // Stats Card
  statsCard: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4A90E2',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e9ecef',
    borderRadius: 4,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4A90E2',
    borderRadius: 4,
  },
  statsSubtext: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  
  // Grades Section
  gradesSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  
  // Grade Cards
  gradeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  gradeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  gradeTitle: {
    flex: 1,
    marginRight: 12,
  },
  assignmentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  assignmentDueDate: {
    fontSize: 12,
    color: '#666',
  },
  gradeScore: {
    alignItems: 'flex-end',
  },
  gradePoints: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  gradePercentage: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  gradeDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  submissionDate: {
    fontSize: 11,
    color: '#666',
  },
  gradedDate: {
    fontSize: 11,
    color: '#666',
  },
  feedbackSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  feedbackLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  feedbackText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 18,
  },
  
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  
  // Instructor Message
  instructorMessage: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  instructorMessageIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  instructorMessageTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  instructorMessageText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  goToAssignmentsButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  goToAssignmentsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Instructor Gradebook Styles
  section: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  viewAllButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  viewAllText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  
  // Assignment Statistics
  assignmentStatCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  assignmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  assignmentInfo: {
    flex: 1,
    marginRight: 12,
  },
  assignmentStats: {
    alignItems: 'flex-end',
  },
  assignmentAverage: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4A90E2',
  },
  assignmentAvgLabel: {
    fontSize: 12,
    color: '#666',
  },
  assignmentProgress: {
    gap: 8,
  },
  progressItem: {
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  
  // Student Cards
  studentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  studentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  studentInfo: {
    flex: 1,
    marginRight: 12,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  studentEmail: {
    fontSize: 12,
    color: '#666',
  },
  studentGrade: {
    alignItems: 'flex-end',
  },
  studentPercentage: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  studentPoints: {
    fontSize: 12,
    color: '#666',
  },
  studentProgress: {
    marginTop: 8,
  },
  studentProgressText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  
  // Student Assignment Grading
  studentAssignments: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  assignmentsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  assignmentsList: {
    flexDirection: 'row',
  },
  assignmentQuickGrade: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  assignmentQuickTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 2,
  },
  assignmentQuickPoints: {
    fontSize: 10,
    color: '#666',
  },
  
  // Grading Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    paddingTop: 50, // Account for status bar
  },
  modalCloseButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  modalCloseText: {
    fontSize: 16,
    color: '#007AFF',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalSaveButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  modalSection: {
    marginBottom: 24,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  
  // Submission Content Styles
  submissionTextContainer: {
    marginBottom: 16,
  },
  submissionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  submissionText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
  },
  submissionTime: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 8,
  },
  
  // Attachments Styles
  attachmentsContainer: {
    marginBottom: 16,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  attachmentIcon: {
    fontSize: 16,
    marginRight: 12,
  },
  attachmentName: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  attachmentAction: {
    fontSize: 12,
    color: '#4A90E2',
  },
  imageAttachment: {
    marginRight: 12,
    alignItems: 'center',
  },
  attachedImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginBottom: 4,
  },
  imageAttachmentName: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
    maxWidth: 80,
  },
  
  // Grading Input Styles
  gradeInputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  gradeInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  feedbackInputContainer: {
    marginBottom: 16,
  },
  feedbackInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#fff',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  
  // No Class Selected Styles
  noClassContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  noClassIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  noClassTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  noClassText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  selectClassButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  selectClassButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 6,
    alignItems: 'center',
  },
  activeToggleButton: {
    backgroundColor: '#4A90E2',
  },
  inactiveToggleButton: {
    backgroundColor: 'transparent',
  },
  toggleButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  activeToggleButtonText: {
    color: '#fff',
  },
  inactiveToggleButtonText: {
    color: '#666',
  },
  assignmentQuickGradeDisabled: {
    opacity: 0.5,
    backgroundColor: '#f5f5f5',
  },
  assignmentQuickGradeGraded: {
    borderWidth: 2,
    borderColor: '#28a745',
    backgroundColor: '#f8fff9',
  },
  assignmentQuickGradeToBeGraded: {
    borderWidth: 2,
    borderColor: '#dc3545',
    backgroundColor: '#fff8f8',
  },
  assignmentQuickTitleDisabled: {
    color: '#999',
  },
  assignmentQuickPointsDisabled: {
    color: '#999',
  },
  noSubmissionText: {
    fontSize: 10,
    color: '#ff6b6b',
    fontStyle: 'italic',
    marginTop: 2,
  },
  gradedText: {
    fontSize: 10,
    color: '#28a745',
    fontWeight: '600',
    marginTop: 2,
  },
  toBeGradedText: {
    fontSize: 10,
    color: '#dc3545',
    fontWeight: '600',
    marginTop: 2,
  },
  gradingSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  editButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  editButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelEditButton: {
    backgroundColor: '#6c757d',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  cancelEditButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  gradeDisplayContainer: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  gradeDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gradeDisplayLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  gradeDisplayValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#28a745',
  },
  feedbackDisplay: {
    marginTop: 8,
  },
  feedbackDisplayLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  feedbackDisplayValue: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  assignmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  scoreSummaryButton: {
    backgroundColor: '#17a2b8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  scoreSummaryButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  overallStatsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  overallStatItem: {
    alignItems: 'center',
  },
  overallStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4A90E2',
  },
  overallStatLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  assignmentSummaryItem: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  assignmentSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  assignmentSummaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    marginRight: 12,
  },
  assignmentSummaryScore: {
    alignItems: 'flex-end',
  },
  assignmentScoreText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#28a745',
  },
  assignmentPercentageText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  assignmentPendingScoreText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffc107',
  },
  assignmentPendingText: {
    fontSize: 12,
    color: '#ffc107',
    fontWeight: '600',
    marginTop: 2,
  },
  assignmentNotSubmittedScoreText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#dc3545',
  },
  assignmentNotSubmittedText: {
    fontSize: 12,
    color: '#dc3545',
    fontWeight: '600',
    marginTop: 2,
  },
  assignmentSummaryDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  assignmentSummaryDue: {
    fontSize: 12,
    color: '#666',
  },
  assignmentStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  gradedBadge: {
    backgroundColor: '#d4edda',
  },
  pendingBadge: {
    backgroundColor: '#fff3cd',
  },
  notSubmittedBadge: {
    backgroundColor: '#f8d7da',
  },
  assignmentStatusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  gradedBadgeText: {
    color: '#155724',
  },
  pendingBadgeText: {
    color: '#856404',
  },
  notSubmittedBadgeText: {
    color: '#721c24',
  },
});