import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Modal, Image, Platform, Linking } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import DateTimePicker from '@react-native-community/datetimepicker';

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

export default function AssignmentsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { classInfo, userRole: passedUserRole } = route.params || {};
  
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(passedUserRole || null);
  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [noDueDate, setNoDueDate] = useState(false);
  
  // Extend Deadline Modal State
  const [showExtendDeadlineModal, setShowExtendDeadlineModal] = useState(false);
  const [selectedAssignmentToExtend, setSelectedAssignmentToExtend] = useState(null);
  const [newExtendedDate, setNewExtendedDate] = useState(new Date());
  const [showExtendDatePicker, setShowExtendDatePicker] = useState(false);
  const [showExtendTimePicker, setShowExtendTimePicker] = useState(false);
  
  // Submission Modal State
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [submissionData, setSubmissionData] = useState({
    text: '',
    attachedFiles: [],
    attachedImages: []
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Instructor Submissions View State
  const [showSubmissionsModal, setShowSubmissionsModal] = useState(false);
  const [currentAssignmentSubmissions, setCurrentAssignmentSubmissions] = useState(null);
  const [submissionsList, setSubmissionsList] = useState([]);
  const [studentsData, setStudentsData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredSubmissionsList, setFilteredSubmissionsList] = useState([]);
  const [filterType, setFilterType] = useState('all'); // 'all', 'submitted', 'not_submitted'
  
  // Create Assignment Modal State
  const [newAssignment, setNewAssignment] = useState({
    title: '',
    description: '',
    dueDate: '',
    points: '',
    instructions: '',
    links: [],
    attachedFiles: [],
    attachedImages: []
  });

  // Initialize assignments collection reference for the specific class
  const assignmentsCollectionRef = db && classInfo ? collection(db, 'classes', classInfo.id, 'assignments') : null;

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

  const getAssignments = async () => {
    if (!assignmentsCollectionRef || !classInfo) {
      console.log('Firebase not initialized or no class selected, using empty assignments');
      setAssignments([]);
      return;
    }

    try {
      console.log('Fetching assignments for class:', classInfo.id, 'User role:', userRole);
      const data = await getDocs(assignmentsCollectionRef);
      let assignmentsData = data.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
      
      // If user is a student, check submission status for each assignment
      if (userRole === 'student' && currentUser) {
        console.log('Checking submissions for student:', currentUser.uid);
        const submissionsCollectionRef = collection(db, 'classes', classInfo.id, 'submissions');
        
        for (let assignment of assignmentsData) {
          const submissionQuery = query(
            submissionsCollectionRef,
            where('assignmentId', '==', assignment.id),
            where('studentId', '==', currentUser.uid)
          );
          
          const submissionDocs = await getDocs(submissionQuery);
          if (!submissionDocs.empty) {
            assignment.userSubmission = submissionDocs.docs[0].data();
            assignment.isSubmitted = true;
            console.log('Found submission for assignment:', assignment.id, assignment.title);
          } else {
            assignment.isSubmitted = false;
            console.log('No submission found for assignment:', assignment.id, assignment.title);
          }
        }
      }
      
      // If user is an instructor, fetch submission counts for each assignment
      if (userRole === 'instructor') {
        console.log('Fetching submission counts for instructor');
        const submissionsCollectionRef = collection(db, 'classes', classInfo.id, 'submissions');
        
        for (let assignment of assignmentsData) {
          const submissionQuery = query(
            submissionsCollectionRef,
            where('assignmentId', '==', assignment.id)
          );
          
          const submissionDocs = await getDocs(submissionQuery);
          assignment.submissions = submissionDocs.docs.map(doc => ({ ...doc.data(), id: doc.id }));
          console.log('Found', assignment.submissions.length, 'submissions for assignment:', assignment.title);
        }
      }
      
      // Sort assignments by due date (earliest first)
      assignmentsData.sort((a, b) => {
        if (a.dueDate && b.dueDate) {
          return new Date(a.dueDate) - new Date(b.dueDate);
        }
        return 0;
      });
      
      console.log('Final assignments data:', assignmentsData.map(a => ({ id: a.id, title: a.title, isSubmitted: a.isSubmitted })));
      setAssignments(assignmentsData);
    } catch (error) {
      console.error("Error fetching assignments: ", error);
      setAssignments([]);
    }
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

  useEffect(() => {
    getAssignments();
    requestImagePermissions();
  }, []);

  useEffect(() => {
    if (userRole) {
      getAssignments();
    }
  }, [userRole]);

  // Refresh assignments when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (userRole && currentUser) {
        getAssignments();
      }
    }, [userRole, currentUser])
  );

  const requestImagePermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Sorry, we need camera roll permissions to add images!');
    }
  };

  const pickImage = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled) {
        setNewAssignment(prev => ({
          ...prev,
          attachedImages: [...prev.attachedImages, result.assets[0]]
        }));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const pickDocument = async () => {
    try {
      let result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!result.canceled && result.assets) {
        setNewAssignment(prev => ({
          ...prev,
          attachedFiles: [...prev.attachedFiles, ...result.assets]
        }));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const addLink = () => {
    Alert.prompt(
      'Add Link',
      'Enter the URL you want to attach:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: (url) => {
            if (url && url.trim()) {
              setNewAssignment(prev => ({
                ...prev,
                links: [...prev.links, { url: url.trim(), title: url.trim() }]
              }));
            }
          }
        }
      ],
      'plain-text',
      '',
      'url'
    );
  };

  const removeImage = (index) => {
    setNewAssignment(prev => ({
      ...prev,
      attachedImages: prev.attachedImages.filter((_, i) => i !== index)
    }));
  };

  const removeFile = (index) => {
    setNewAssignment(prev => ({
      ...prev,
      attachedFiles: prev.attachedFiles.filter((_, i) => i !== index)
    }));
  };

  const removeLink = (index) => {
    setNewAssignment(prev => ({
      ...prev,
      links: prev.links.filter((_, i) => i !== index)
    }));
  };

  const getFileIcon = (fileName) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf': return '📄';
      case 'doc':
      case 'docx': return '📝';
      case 'xls':
      case 'xlsx': return '📊';
      case 'ppt':
      case 'pptx': return '📺';
      case 'txt': return '📋';
      case 'zip':
      case 'rar': return '🗂️';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif': return '🖼️';
      default: return '📎';
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleCreateAssignment = async () => {
    if (!newAssignment.title.trim() || (!noDueDate && !newAssignment.dueDate)) {
      Alert.alert('Error', 'Please fill in title and set due date or select "No due date"');
      return;
    }

    setIsLoading(true);
    
    if (!assignmentsCollectionRef) {
      console.log('Firebase not available, assignment creation failed');
      Alert.alert('Error', 'Unable to create assignment. Please try again.');
      setIsLoading(false);
      return;
    }

    try {
      const assignmentData = {
        title: newAssignment.title.trim(),
        description: newAssignment.description.trim(),
        instructions: newAssignment.instructions.trim(),
        dueDate: noDueDate ? null : newAssignment.dueDate,
        points: parseInt(newAssignment.points) || 100,
        createdAt: new Date(),
        createdBy: currentUser?.uid,
        createdByName: currentUser?.displayName || currentUser?.email || 'Instructor',
        classId: classInfo?.id,
        className: classInfo?.name,
        submissions: [],
        status: 'active',
        attachedFiles: newAssignment.attachedFiles,
        attachedImages: newAssignment.attachedImages,
        links: newAssignment.links,
        hasNoDueDate: noDueDate
      };

      await addDoc(assignmentsCollectionRef, assignmentData);
      
      // Reset form
      setNewAssignment({
        title: '',
        description: '',
        dueDate: '',
        points: '',
        instructions: '',
        links: [],
        attachedFiles: [],
        attachedImages: []
      });
      setSelectedDate(new Date());
      setSelectedTime(new Date());
      setNoDueDate(false);
      
      setShowCreateModal(false);
      getAssignments(); // Refresh the list
      Alert.alert('Success', 'Assignment created successfully!');
    } catch (error) {
      console.error("Error creating assignment: ", error);
      Alert.alert('Error', 'Failed to create assignment. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAssignment = async (assignmentId) => {
    if (!db || !assignmentId) return;

    Alert.alert(
      'Delete Assignment',
      'Are you sure you want to delete this assignment? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'classes', classInfo.id, 'assignments', assignmentId));
              getAssignments(); // Refresh the list
              Alert.alert('Success', 'Assignment deleted successfully');
            } catch (error) {
              console.error('Error deleting assignment:', error);
              Alert.alert('Error', 'Failed to delete assignment');
            }
          }
        }
      ]
    );
  };

  // Extend Deadline Functions
  const openExtendDeadlineModal = (assignment) => {
    setSelectedAssignmentToExtend(assignment);
    const currentDate = assignment.dueDate ? new Date(assignment.dueDate) : new Date();
    setNewExtendedDate(currentDate);
    setShowExtendDeadlineModal(true);
  };

  const handleExtendDeadline = async () => {
    if (!selectedAssignmentToExtend || !newExtendedDate) {
      Alert.alert('Error', 'Please select a new deadline');
      return;
    }

    try {
      const assignmentRef = doc(db, 'classes', classInfo.id, 'assignments', selectedAssignmentToExtend.id);
      await updateDoc(assignmentRef, {
        dueDate: newExtendedDate.toISOString(),
        extendedAt: new Date(),
        extendedBy: currentUser?.uid
      });
      
      setShowExtendDeadlineModal(false);
      getAssignments(); // Refresh the list
      Alert.alert('Success', 'Deadline extended successfully!');
    } catch (error) {
      console.error('Error extending deadline:', error);
      Alert.alert('Error', 'Failed to extend deadline');
    }
  };

  const handleExtendDateChange = (event, date) => {
    if (Platform.OS === 'android') {
      setShowExtendDatePicker(false);
    }
    
    if (date) {
      // Combine with existing time or set default time
      let finalDate = date;
      if (selectedAssignmentToExtend?.dueDate) {
        const existingDate = new Date(selectedAssignmentToExtend.dueDate);
        finalDate = new Date(date);
        finalDate.setHours(existingDate.getHours());
        finalDate.setMinutes(existingDate.getMinutes());
      } else {
        finalDate.setHours(23, 59, 0, 0);
      }
      setNewExtendedDate(finalDate);
    }
  };

  const handleExtendTimeChange = (event, time) => {
    if (Platform.OS === 'android') {
      setShowExtendTimePicker(false);
    }
    
    if (time) {
      const finalDate = new Date(newExtendedDate);
      finalDate.setHours(time.getHours());
      finalDate.setMinutes(time.getMinutes());
      setNewExtendedDate(finalDate);
    }
  };

  // Date picker functions
  const handleDateChange = (event, date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    
    if (date) {
      setSelectedDate(date);
      // Combine the selected date with current time if time was previously set
      let finalDate = date;
      if (newAssignment.dueDate) {
        const existingDate = new Date(newAssignment.dueDate);
        finalDate = new Date(date);
        finalDate.setHours(existingDate.getHours());
        finalDate.setMinutes(existingDate.getMinutes());
      } else {
        // Set default time to 11:59 PM
        finalDate.setHours(23, 59, 0, 0);
      }
      setSelectedTime(finalDate);
      setNewAssignment({...newAssignment, dueDate: finalDate.toISOString()});
    }
  };

  const handleTimeChange = (event, time) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
    
    if (time) {
      setSelectedTime(time);
      // Combine the existing date with the new time
      const existingDate = new Date(newAssignment.dueDate);
      const finalDate = new Date(existingDate);
      finalDate.setHours(time.getHours());
      finalDate.setMinutes(time.getMinutes());
      setNewAssignment({...newAssignment, dueDate: finalDate.toISOString()});
    }
  };

  const showDatePickerModal = () => {
    setShowDatePicker(true);
  };

  const formatDisplayDate = (dateString) => {
    if (!dateString) return 'Select due date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDisplayTime = (dateString) => {
    if (!dateString) return 'Set time';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'No due date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const isOverdue = (dueDate) => {
    if (!dueDate) return false; // No due date means never overdue
    return new Date(dueDate) < new Date();
  };

  // Submission Functions
  const openSubmissionModal = (assignment) => {
    console.log('Opening submission modal for:', assignment.title);
    
    // Check if the assignment deadline has passed and it hasn't been submitted
    if (isOverdue(assignment.dueDate) && !assignment.isSubmitted) {
      Alert.alert(
        'Submission Deadline Passed', 
        'This assignment is past its due date. You can no longer submit your work.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    setSelectedAssignment(assignment);
    
    // If assignment was previously submitted, populate with existing data
    if (assignment.isSubmitted && assignment.userSubmission) {
      const newSubmissionData = {
        text: assignment.userSubmission.submissionText || '',
        attachedFiles: assignment.userSubmission.attachedFiles || [],
        attachedImages: assignment.userSubmission.attachedImages || []
      };
      console.log('Loading previous submission data:', newSubmissionData);
      setSubmissionData(newSubmissionData);
    } else {
      const emptySubmissionData = {
        text: '',
        attachedFiles: [],
        attachedImages: []
      };
      console.log('Loading empty submission data:', emptySubmissionData);
      setSubmissionData(emptySubmissionData);
    }
    
    setShowSubmissionModal(true);
  };

  const closeSubmissionModal = () => {
    setShowSubmissionModal(false);
    setSelectedAssignment(null);
    setSubmissionData({
      text: '',
      attachedFiles: [],
      attachedImages: []
    });
    // Refresh assignments to ensure latest submission status is shown
    getAssignments();
  };

  const pickImageForSubmission = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const newImage = {
        name: `image_${Date.now()}.jpg`,
        uri: result.assets[0].uri,
        type: 'image',
        size: result.assets[0].fileSize || 0
      };
      
      setSubmissionData(prev => ({
        ...prev,
        attachedImages: [...prev.attachedImages, newImage]
      }));
    }
  };

  const pickDocumentForSubmission = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const newFile = {
          name: result.assets[0].name,
          uri: result.assets[0].uri,
          type: 'file',
          size: result.assets[0].size || 0,
          mimeType: result.assets[0].mimeType
        };
        
        setSubmissionData(prev => ({
          ...prev,
          attachedFiles: [...prev.attachedFiles, newFile]
        }));
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const removeAttachment = (type, index) => {
    if (type === 'image') {
      setSubmissionData(prev => ({
        ...prev,
        attachedImages: prev.attachedImages.filter((_, i) => i !== index)
      }));
    } else {
      setSubmissionData(prev => ({
        ...prev,
        attachedFiles: prev.attachedFiles.filter((_, i) => i !== index)
      }));
    }
  };

  const submitAssignment = async () => {
    console.log('Submit assignment called');
    console.log('submissionData:', submissionData);
    
    if (!selectedAssignment || !currentUser || !db) {
      Alert.alert('Error', 'Unable to submit assignment');
      return;
    }

    // Check if the assignment deadline has passed
    if (isOverdue(selectedAssignment.dueDate)) {
      Alert.alert(
        'Submission Deadline Passed', 
        'This assignment is past its due date. You can no longer submit your work.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Safety check for submissionData
    if (!submissionData) {
      console.log('submissionData is null/undefined');
      Alert.alert('Error', 'Submission data not found');
      return;
    }

    console.log('submissionData.text:', submissionData.text);
    console.log('submissionData.attachedFiles:', submissionData.attachedFiles);
    console.log('submissionData.attachedImages:', submissionData.attachedImages);

    const hasText = submissionData.text && submissionData.text.trim().length > 0;
    const hasFiles = submissionData.attachedFiles && submissionData.attachedFiles.length > 0;
    const hasImages = submissionData.attachedImages && submissionData.attachedImages.length > 0;

    if (!hasText && !hasFiles && !hasImages) {
      Alert.alert('Error', 'Please add some content or attachments to submit');
      return;
    }

    setIsSubmitting(true);
    try {
      const submission = {
        assignmentId: selectedAssignment.id,
        studentId: currentUser.uid,
        studentName: currentUser.displayName || currentUser.email,
        studentEmail: currentUser.email,
        submissionText: submissionData.text ? submissionData.text.trim() : '',
        attachedFiles: submissionData.attachedFiles || [],
        attachedImages: submissionData.attachedImages || [],
        submittedAt: new Date(),
        status: 'submitted',
        grade: null,
        feedback: '',
        gradedAt: null,
        gradedBy: null
      };

      // Create a separate submissions collection for this class
      const submissionsCollectionRef = collection(db, 'classes', classInfo.id, 'submissions');
      
      // Check if student already submitted
      const existingSubmissionQuery = query(
        submissionsCollectionRef,
        where('assignmentId', '==', selectedAssignment.id),
        where('studentId', '==', currentUser.uid)
      );
      
      const existingSubmissions = await getDocs(existingSubmissionQuery);
      
      if (!existingSubmissions.empty) {
        // Update existing submission
        const existingDoc = existingSubmissions.docs[0];
        await updateDoc(doc(db, 'classes', classInfo.id, 'submissions', existingDoc.id), {
          ...submission,
          submittedAt: new Date() // Update submission time
        });
        Alert.alert('Success', 'Assignment updated successfully!');
      } else {
        // Create new submission
        await addDoc(submissionsCollectionRef, submission);
        Alert.alert('Success', 'Assignment submitted successfully!');
      }

      // Update local state immediately
      const userSubmissionData = {
        submissionText: submission.submissionText,
        attachedFiles: submission.attachedFiles,
        attachedImages: submission.attachedImages,
        submittedAt: new Date()
      };

      // Update assignments list
      setAssignments(prevAssignments => 
        prevAssignments.map(assignment => 
          assignment.id === selectedAssignment.id 
            ? { ...assignment, isSubmitted: true, userSubmission: userSubmissionData }
            : assignment
        )
      );

      // Update selected assignment
      setSelectedAssignment(prev => ({
        ...prev,
        isSubmitted: true,
        userSubmission: userSubmissionData
      }));

      getAssignments(); // Refresh to show updated submission status
    } catch (error) {
      console.error('Error submitting assignment:', error);
      Alert.alert('Error', 'Failed to submit assignment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const unsubmitAssignment = async () => {
    if (!selectedAssignment || !currentUser || !db) {
      Alert.alert('Error', 'Unable to unsubmit assignment');
      return;
    }

    try {
      setIsSubmitting(true);

      // Delete the submission document
      const submissionsRef = collection(db, 'classes', classInfo.id, 'submissions');
      const submissionQuery = query(
        submissionsRef,
        where('assignmentId', '==', selectedAssignment.id),
        where('studentId', '==', currentUser.uid)
      );
      
      const submissionSnapshot = await getDocs(submissionQuery);
      
      if (!submissionSnapshot.empty) {
        const submissionDoc = submissionSnapshot.docs[0];
        await deleteDoc(submissionDoc.ref);
      }

      // Update local state
      setAssignments(prevAssignments => 
        prevAssignments.map(assignment => 
          assignment.id === selectedAssignment.id 
            ? { ...assignment, isSubmitted: false, userSubmission: null }
            : assignment
        )
      );

      // Keep the submission data in "Your work" for editing
      // The data is already in submissionData from when modal opened
      
      // Update selected assignment
      setSelectedAssignment(prev => ({
        ...prev,
        isSubmitted: false,
        userSubmission: null
      }));

      Alert.alert('Success', 'Assignment unsubmitted! You can now edit your work.');
      getAssignments(); // Refresh to update submission counts for instructors
      
    } catch (error) {
      console.error('Error unsubmitting assignment:', error);
      Alert.alert('Error', 'Failed to unsubmit assignment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Attachment viewing functions
  const handleAttachmentPress = async (attachment, type) => {
    console.log('Attachment pressed:', attachment, 'Type:', type);
    try {
      if (type === 'image') {
        // For images, offer different options
        Alert.alert(
          'View Image',
          `What would you like to do with ${attachment.name || attachment.fileName || 'this image'}?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open in Gallery', onPress: () => openAttachment(attachment) },
            { text: 'Share', onPress: () => shareAttachment(attachment) }
          ]
        );
      } else if (type === 'file') {
        // For files, show options
        Alert.alert(
          'Open File',
          `Open ${attachment.name}?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open', onPress: () => openAttachment(attachment) }
          ]
        );
      }
    } catch (error) {
      console.error('Error handling attachment press:', error);
      Alert.alert('Error', 'Unable to open attachment');
    }
  };

  const openAttachment = async (attachment) => {
    console.log('Opening attachment:', attachment);
    try {
      if (attachment.uri) {
        // Try to open directly first (works for some URIs)
        try {
          const canOpen = await Linking.canOpenURL(attachment.uri);
          if (canOpen && !attachment.uri.includes('cache/DocumentPicker')) {
            await Linking.openURL(attachment.uri);
            return;
          }
        } catch (linkingError) {
          console.log('Linking failed, trying sharing:', linkingError);
        }

        // Fallback to sharing if direct linking doesn't work
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(attachment.uri, {
            mimeType: attachment.mimeType || attachment.type || 'application/octet-stream',
            dialogTitle: `Open ${attachment.name || attachment.fileName || 'file'}`,
            UTI: attachment.mimeType || attachment.type || 'public.item'
          });
        } else {
          Alert.alert(
            'Cannot Open File',
            'File sharing is not available on this platform.',
            [{ text: 'OK', style: 'default' }]
          );
        }
      } else {
        Alert.alert('Error', 'File location not available');
      }
    } catch (error) {
      console.error('Error opening attachment:', error);
      
      if (error.message && error.message.includes('exposed beyond app')) {
        Alert.alert(
          'Security Restriction',
          'This file cannot be opened directly due to security restrictions. Using the sharing interface instead.',
          [{ text: 'OK', style: 'default' }]
        );
      } else {
        Alert.alert(
          'Error Opening File',
          'Unable to open this file. The file may not be available or the file type is not supported.',
          [{ text: 'OK', style: 'default' }]
        );
      }
    }
  };

  const shareAttachment = async (attachment) => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(attachment.uri, {
          mimeType: attachment.mimeType || attachment.type || 'application/octet-stream',
          dialogTitle: `Share ${attachment.name || attachment.fileName || 'file'}`,
          UTI: attachment.mimeType || attachment.type || 'public.item'
        });
      }
    } catch (error) {
      console.error('Error sharing attachment:', error);
      Alert.alert('Error', 'Failed to share attachment');
    }
  };

  const viewSubmissions = async (assignment) => {
    try {
      console.log('ViewSubmissions called for assignment:', assignment.id, assignment.title);
      console.log('Class ID:', classInfo?.id);
      setCurrentAssignmentSubmissions(assignment);
      
      // Fetch all submissions for this assignment
      const submissionsQuery = query(
        collection(db, 'classes', classInfo?.id, 'submissions'),
        where('assignmentId', '==', assignment.id)
      );
      
      const submissionsSnapshot = await getDocs(submissionsQuery);
      const submissions = submissionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log('Found submissions:', submissions.length, submissions);
      
      // Try to fetch enrolled students first
      let allStudents = [];
      try {
        const studentsQuery = query(
          collection(db, 'classes', classInfo?.id, 'students')
        );
        
        const studentsSnapshot = await getDocs(studentsQuery);
        allStudents = studentsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        console.log('Found enrolled students:', allStudents.length);
      } catch (error) {
        console.log('No students collection found, using submissions data');
      }
      
      // If no enrolled students found, create list from submissions + maybe include a way to add missing students
      if (allStudents.length === 0) {
        // Create student list from submissions only
        allStudents = submissions.map(submission => ({
          id: submission.studentId,
          name: submission.studentName || submission.studentEmail || 'Unknown Student',
          email: submission.studentEmail || 'No email'
        }));
      }
      
      // Combine submissions with student data
      const submissionsWithStudentData = allStudents.map(student => {
        const submission = submissions.find(sub => sub.studentId === student.id);
        return {
          student,
          submission: submission || null,
          hasSubmitted: !!submission
        };
      });
      
      console.log('Submissions with student data:', submissionsWithStudentData);
      
      setSubmissionsList(submissionsWithStudentData);
      setStudentsData(allStudents);
      setShowSubmissionsModal(true);
      
    } catch (error) {
      console.error('Error fetching submissions:', error);
      Alert.alert('Error', 'Failed to load submissions');
    }
  };

  // Search and filter function for submissions
  const applyFiltersAndSearch = (query = searchQuery, filter = filterType) => {
    let filtered = [...submissionsList];
    
    // Apply status filter first
    if (filter === 'submitted') {
      filtered = filtered.filter(item => item.hasSubmitted);
    } else if (filter === 'not_submitted') {
      filtered = filtered.filter(item => !item.hasSubmitted);
    }
    
    // Apply search filter
    if (query.trim()) {
      filtered = filtered.filter(item => {
        const studentName = (item.student.name || '').toLowerCase();
        const studentEmail = (item.student.email || '').toLowerCase();
        const searchTerm = query.toLowerCase();
        
        return studentName.includes(searchTerm) || studentEmail.includes(searchTerm);
      });
    }
    
    setFilteredSubmissionsList(filtered);
  };

  // Handle search
  const handleSearch = (query) => {
    setSearchQuery(query);
    applyFiltersAndSearch(query, filterType);
  };

  // Handle filter change
  const handleFilterChange = (filter) => {
    setFilterType(filter);
    applyFiltersAndSearch(searchQuery, filter);
  };

  // Update filtered list when submissions list changes
  React.useEffect(() => {
    applyFiltersAndSearch(searchQuery, filterType);
  }, [submissionsList]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.title}>Assignments</Text>
          <Text style={styles.subtitle}>{classInfo?.name || 'Class Assignments'}</Text>
        </View>
        {userRole === 'instructor' && (
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => setShowCreateModal(true)}
          >
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content}>
        {isLoading ? (
          <View style={{ alignItems: 'center', padding: 40 }}>
            <Text style={{ fontSize: 24, color: '#E75C1A' }}>Loading...</Text>
          </View>
        ) : assignments.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>📝</Text>
            <Text style={styles.emptyStateTitle}>No assignments yet</Text>
            <Text style={styles.emptyStateText}>
              {userRole === 'instructor' 
                ? 'Create your first assignment to get started!'
                : 'Your instructor hasn\'t posted any assignments yet.'
              }
            </Text>
          </View>
        ) : (
          assignments.map((assignment) => (
            userRole === 'student' ? (
              // Clickable assignment card for students
              <TouchableOpacity 
                key={assignment.id} 
                style={[
                  styles.assignmentCard,
                  isOverdue(assignment.dueDate) && !assignment.isSubmitted && styles.assignmentCardDisabled
                ]}
                onPress={() => {
                  console.log('Card clicked!');
                  openSubmissionModal(assignment);
                }}
                activeOpacity={isOverdue(assignment.dueDate) && !assignment.isSubmitted ? 1 : 0.7}
                disabled={false}
              >
              <View style={styles.assignmentHeader}>
                <View style={styles.assignmentTitleRow}>
                  <Text style={styles.assignmentTitle}>{assignment.title}</Text>
                  <Text style={styles.assignmentPoints}>{assignment.points} pts</Text>
                </View>
                
                {/* Submission Status for Students */}
                {userRole === 'student' && assignment.isSubmitted && (
                  <View style={styles.submissionStatus}>
                    <Text style={styles.submissionStatusIcon}>✅</Text>
                    <Text style={[
                      styles.submissionStatusText,
                      (() => {
                        const submittedAt = assignment.userSubmission.submittedAt;
                        let submissionDate;
                        
                        if (submittedAt && submittedAt.seconds) {
                          submissionDate = new Date(submittedAt.seconds * 1000);
                        } else if (submittedAt) {
                          submissionDate = new Date(submittedAt);
                        } else {
                          submissionDate = new Date();
                        }
                        
                        const dueDate = new Date(assignment.dueDate);
                        return submissionDate > dueDate ? styles.lateSubmission : styles.onTimeSubmission;
                      })()
                    ]}>
                      Submitted on {(() => {
                        const submittedAt = assignment.userSubmission.submittedAt;
                        let date;
                        
                        if (submittedAt && submittedAt.seconds) {
                          // Firestore timestamp
                          date = new Date(submittedAt.seconds * 1000);
                        } else if (submittedAt) {
                          // Regular date object or string
                          date = new Date(submittedAt);
                        } else {
                          date = new Date();
                        }
                        
                        return date.toLocaleDateString();
                      })()}
                    </Text>
                  </View>
                )}
                
                <View style={styles.assignmentMetaRow}>
                  <Text style={[
                    styles.assignmentDueDate,
                    isOverdue(assignment.dueDate) && styles.overdue
                  ]}>
                    Due: {formatDate(assignment.dueDate)}
                    {isOverdue(assignment.dueDate) && ' (Overdue)'}
                  </Text>
                  {userRole === 'instructor' && (
                    <View style={styles.instructorActions}>
                      {/* Extend deadline button - always show for testing */}
                      <TouchableOpacity 
                        style={styles.extendButton}
                        onPress={() => {
                          console.log('Extend button pressed for:', assignment.title);
                          Alert.alert('Extend Deadline', `Extend deadline for: ${assignment.title}`);
                          // openExtendDeadlineModal(assignment);
                        }}
                      >
                        <Text style={styles.extendButtonText}>⏰</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.deleteButton}
                        onPress={() => handleDeleteAssignment(assignment.id)}
                      >
                        <Text style={styles.deleteButtonText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
              
              {assignment.description && (
                <Text style={styles.assignmentDescription}>{assignment.description}</Text>
              )}
              
              {assignment.instructions && (
                <View style={styles.instructionsSection}>
                  <Text style={styles.instructionsLabel}>Instructions:</Text>
                  <Text style={styles.instructionsText}>{assignment.instructions}</Text>
                </View>
              )}

              {/* Attachments Display */}
              {(assignment.attachedImages?.length > 0 || assignment.attachedFiles?.length > 0 || assignment.links?.length > 0) && (
                <View style={styles.attachmentsSection}>
                  <Text style={styles.attachmentsLabel}>Attachments:</Text>
                  
                  {/* Images */}
                  {assignment.attachedImages?.map((image, index) => (
                    <TouchableOpacity 
                      key={`img-${index}`} 
                      style={styles.attachmentItem}
                      onPress={() => handleAttachmentPress(image, 'image')}
                    >
                      <Image source={{ uri: image.uri }} style={styles.attachmentImage} />
                      <Text style={styles.attachmentName} numberOfLines={1}>
                        {image.fileName || `Image ${index + 1}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  
                  {/* Files */}
                  {assignment.attachedFiles?.map((file, index) => (
                    <TouchableOpacity 
                      key={`file-${index}`} 
                      style={styles.attachmentItem}
                      onPress={() => handleAttachmentPress(file, 'file')}
                    >
                      <Text style={styles.attachmentIcon}>{getFileIcon(file.name)}</Text>
                      <View style={styles.attachmentInfo}>
                        <Text style={styles.attachmentName} numberOfLines={1}>{file.name}</Text>
                        <Text style={styles.attachmentSize}>{formatFileSize(file.size)}</Text>
                      </View>
                      <Text style={styles.downloadIcon}>⬇️</Text>
                    </TouchableOpacity>
                  ))}
                  
                  {/* Links */}
                  {assignment.links?.map((link, index) => (
                    <TouchableOpacity
                      key={`link-${index}`}
                      style={styles.attachmentItem}
                      onPress={() => Linking.openURL(link.url)}
                    >
                      <Text style={styles.attachmentIcon}>🔗</Text>
                      <View style={styles.attachmentInfo}>
                        <Text style={styles.attachmentName} numberOfLines={1}>{link.title}</Text>
                        <Text style={styles.linkUrl} numberOfLines={1}>{link.url}</Text>
                      </View>
                      <Text style={styles.externalIcon}>↗️</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              
              {/* Tap to submit indicator */}
              <View style={styles.tapToSubmitSection}>
                <Text style={styles.tapToSubmitText}>
                  {assignment.isSubmitted ? 'Tap to unsubmit' : 'Tap to submit'}
                </Text>
                <Text style={styles.tapToSubmitIcon}>📝</Text>
              </View>
            </TouchableOpacity>
            ) : (
              // Non-clickable assignment card for instructors
              <View key={assignment.id} style={styles.assignmentCard}>
                <View style={styles.assignmentHeader}>
                  <View style={styles.assignmentTitleRow}>
                    <Text style={styles.assignmentTitle}>{assignment.title}</Text>
                    <Text style={styles.assignmentPoints}>{assignment.points} pts</Text>
                  </View>
                  
                  <View style={styles.assignmentMetaRow}>
                    <Text style={[
                      styles.assignmentDueDate,
                      isOverdue(assignment.dueDate) && styles.overdue
                    ]}>
                      Due: {formatDate(assignment.dueDate)}
                      {isOverdue(assignment.dueDate) && ' (Overdue)'}
                    </Text>
                    <View style={styles.instructorActions}>
                      {assignment.dueDate && !assignment.hasNoDueDate && (
                        <TouchableOpacity 
                          style={styles.extendButton}
                          onPress={() => {
                            openExtendDeadlineModal(assignment);
                          }}
                        >
                          <Text style={styles.extendButtonText}>⏰</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity 
                        style={styles.deleteButton}
                        onPress={() => handleDeleteAssignment(assignment.id)}
                      >
                        <Text style={styles.deleteButtonText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
                
                {assignment.description && (
                  <Text style={styles.assignmentDescription}>{assignment.description}</Text>
                )}
                
                {assignment.instructions && (
                  <View style={styles.instructionsSection}>
                    <Text style={styles.instructionsLabel}>Instructions:</Text>
                    <Text style={styles.instructionsText}>{assignment.instructions}</Text>
                  </View>
                )}

                {/* Attachments Display */}
                {(assignment.attachedImages?.length > 0 || assignment.attachedFiles?.length > 0 || assignment.links?.length > 0) && (
                  <View style={styles.attachmentsSection}>
                    <Text style={styles.attachmentsLabel}>Attachments:</Text>
                    
                    {/* Attached Images */}
                    {assignment.attachedImages?.map((image, index) => (
                      <TouchableOpacity 
                        key={`image-${index}`} 
                        style={styles.attachmentItem}
                        onPress={() => handleAttachmentPress(image, 'image')}
                      >
                        <Image source={{ uri: image.uri }} style={styles.attachmentPreview} />
                        <View style={styles.attachmentInfo}>
                          <Text style={styles.attachmentName} numberOfLines={1}>{image.name}</Text>
                          <Text style={styles.attachmentSize}>Image</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                    
                    {/* Attached Files */}
                    {assignment.attachedFiles?.map((file, index) => (
                      <TouchableOpacity 
                        key={`file-${index}`} 
                        style={styles.attachmentItem}
                        onPress={() => handleAttachmentPress(file, 'file')}
                      >
                        <Text style={styles.attachmentIcon}>📎</Text>
                        <View style={styles.attachmentInfo}>
                          <Text style={styles.attachmentName} numberOfLines={1}>{file.name}</Text>
                          <Text style={styles.attachmentSize}>File</Text>
                        </View>
                        <Text style={styles.downloadIcon}>⬇️</Text>
                      </TouchableOpacity>
                    ))}
                    
                    {/* Links */}
                    {assignment.links?.map((link, index) => (
                      <TouchableOpacity
                        key={`link-${index}`}
                        style={styles.attachmentItem}
                        onPress={() => Linking.openURL(link.url)}
                      >
                        <Text style={styles.attachmentIcon}>🔗</Text>
                        <View style={styles.attachmentInfo}>
                          <Text style={styles.attachmentName} numberOfLines={1}>{link.title}</Text>
                          <Text style={styles.linkUrl} numberOfLines={1}>{link.url}</Text>
                        </View>
                        <Text style={styles.externalIcon}>↗️</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                
                {/* Instructor Actions */}
                <View style={styles.assignmentActions}>
                  <TouchableOpacity 
                    style={styles.viewSubmissionsButton}
                    onPress={() => viewSubmissions(assignment)}
                  >
                    <Text style={styles.viewSubmissionsButtonText}>
                      View Submissions ({assignment.submissions?.length || 0})
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          ))
        )}
      </ScrollView>

      {/* Create Assignment Modal */}
      <Modal visible={showCreateModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Assignment</Text>
              <TouchableOpacity onPress={() => {
                setShowCreateModal(false);
                setSelectedDate(new Date());
                setNewAssignment({
                  title: '',
                  description: '',
                  dueDate: '',
                  points: '',
                  instructions: '',
                  links: [],
                  attachedFiles: [],
                  attachedImages: []
                });
              }}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Assignment Title *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter assignment title"
                  value={newAssignment.title}
                  onChangeText={(text) => setNewAssignment({...newAssignment, title: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Brief description of the assignment"
                  multiline
                  numberOfLines={3}
                  value={newAssignment.description}
                  onChangeText={(text) => setNewAssignment({...newAssignment, description: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Instructions</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Detailed instructions for students"
                  multiline
                  numberOfLines={4}
                  value={newAssignment.instructions}
                  onChangeText={(text) => setNewAssignment({...newAssignment, instructions: text})}
                />
              </View>

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.inputLabel}>Due Date</Text>
                  
                  {/* No Due Date Checkbox */}
                  <TouchableOpacity 
                    style={styles.checkboxContainer}
                    onPress={() => {
                      setNoDueDate(!noDueDate);
                      if (!noDueDate) {
                        setNewAssignment({...newAssignment, dueDate: ''});
                      }
                    }}
                  >
                    <View style={[styles.checkbox, noDueDate && styles.checkboxChecked]}>
                      {noDueDate && <Text style={styles.checkboxCheck}>✓</Text>}
                    </View>
                    <Text style={styles.checkboxLabel}>No due date</Text>
                  </TouchableOpacity>
                  
                  {/* Date Picker Button */}
                  {!noDueDate && (
                    <>
                      <TouchableOpacity
                        style={[styles.textInput, styles.datePickerButton]}
                        onPress={showDatePickerModal}
                      >
                        <Text style={[
                          styles.datePickerText,
                          !newAssignment.dueDate && styles.placeholderText
                        ]}>
                          {formatDisplayDate(newAssignment.dueDate)}
                        </Text>
                        <Text style={styles.calendarIcon}>📅</Text>
                      </TouchableOpacity>
                      
                      {/* Time Picker Button */}
                      {newAssignment.dueDate && (
                        <TouchableOpacity
                          style={[styles.textInput, styles.timePickerButton]}
                          onPress={() => setShowTimePicker(true)}
                        >
                          <Text style={styles.timePickerText}>
                            {formatDisplayTime(newAssignment.dueDate)}
                          </Text>
                          <Text style={styles.clockIcon}>🕐</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>

                <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.inputLabel}>Points</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="100"
                    keyboardType="numeric"
                    value={newAssignment.points}
                    onChangeText={(text) => setNewAssignment({...newAssignment, points: text})}
                  />
                </View>
              </View>

              {/* Attachments Section */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Attachments</Text>
                
                {/* Attachment Buttons */}
                <View style={styles.attachmentButtons}>
                  <TouchableOpacity style={styles.attachmentButton} onPress={pickImage}>
                    <Text style={styles.attachmentButtonIcon}>🖼️</Text>
                    <Text style={styles.attachmentButtonText}>Images</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.attachmentButton} onPress={pickDocument}>
                    <Text style={styles.attachmentButtonIcon}>📎</Text>
                    <Text style={styles.attachmentButtonText}>Files</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.attachmentButton} onPress={addLink}>
                    <Text style={styles.attachmentButtonIcon}>🔗</Text>
                    <Text style={styles.attachmentButtonText}>Links</Text>
                  </TouchableOpacity>
                </View>

                {/* Attached Images Preview */}
                {newAssignment.attachedImages.length > 0 && (
                  <View style={styles.attachedItemsContainer}>
                    <Text style={styles.attachedItemsLabel}>Attached Images:</Text>
                    {newAssignment.attachedImages.map((image, index) => (
                      <View key={index} style={styles.attachedItem}>
                        <Image source={{ uri: image.uri }} style={styles.previewImage} />
                        <View style={styles.attachedItemInfo}>
                          <Text style={styles.attachedItemName}>
                            {image.fileName || `Image ${index + 1}`}
                          </Text>
                        </View>
                        <TouchableOpacity 
                          style={styles.removeButton}
                          onPress={() => removeImage(index)}
                        >
                          <Text style={styles.removeButtonText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* Attached Files Preview */}
                {newAssignment.attachedFiles.length > 0 && (
                  <View style={styles.attachedItemsContainer}>
                    <Text style={styles.attachedItemsLabel}>Attached Files:</Text>
                    {newAssignment.attachedFiles.map((file, index) => (
                      <View key={index} style={styles.attachedItem}>
                        <Text style={styles.attachedFileIcon}>{getFileIcon(file.name)}</Text>
                        <View style={styles.attachedItemInfo}>
                          <Text style={styles.attachedItemName} numberOfLines={1}>
                            {file.name}
                          </Text>
                          <Text style={styles.attachedItemSize}>
                            {formatFileSize(file.size)}
                          </Text>
                        </View>
                        <TouchableOpacity 
                          style={styles.removeButton}
                          onPress={() => removeFile(index)}
                        >
                          <Text style={styles.removeButtonText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* Attached Links Preview */}
                {newAssignment.links.length > 0 && (
                  <View style={styles.attachedItemsContainer}>
                    <Text style={styles.attachedItemsLabel}>Attached Links:</Text>
                    {newAssignment.links.map((link, index) => (
                      <View key={index} style={styles.attachedItem}>
                        <Text style={styles.attachedFileIcon}>🔗</Text>
                        <View style={styles.attachedItemInfo}>
                          <Text style={styles.attachedItemName} numberOfLines={1}>
                            {link.title}
                          </Text>
                          <Text style={styles.attachedItemSize} numberOfLines={1}>
                            {link.url}
                          </Text>
                        </View>
                        <TouchableOpacity 
                          style={styles.removeButton}
                          onPress={() => removeLink(index)}
                        >
                          <Text style={styles.removeButtonText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => {
                  setShowCreateModal(false);
                  setSelectedDate(new Date());
                  setNewAssignment({
                    title: '',
                    description: '',
                    dueDate: '',
                    points: '',
                    instructions: '',
                    links: [],
                    attachedFiles: [],
                    attachedImages: []
                  });
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.createButton, isLoading && styles.createButtonDisabled]}
                onPress={handleCreateAssignment}
                disabled={isLoading}
              >
                <Text style={styles.createButtonText}>
                  {isLoading ? 'Creating...' : 'Create Assignment'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Extend Deadline Modal */}
      <Modal visible={showExtendDeadlineModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.extendDeadlineModalContainer}>
            {/* Header */}
            <View style={styles.extendModalHeader}>
              <View style={styles.extendModalHeaderContent}>
                <View style={styles.extendModalIcon}>
                  <Text style={styles.extendModalIconText}>⏰</Text>
                </View>
                <Text style={styles.extendModalTitle}>Extend Deadline</Text>
              </View>
              <TouchableOpacity 
                style={styles.extendModalCloseButton}
                onPress={() => setShowExtendDeadlineModal(false)}
              >
                <Text style={styles.extendModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Scrollable Content */}
            <View style={styles.extendModalScrollContent}>
              {/* Assignment Info Card */}
              <View style={styles.assignmentInfoCard}>
                <Text style={styles.assignmentInfoLabel}>Assignment</Text>
                <Text style={styles.assignmentInfoTitle}>{selectedAssignmentToExtend?.title}</Text>
                <View style={styles.currentDeadlineContainer}>
                  <Text style={styles.currentDeadlineLabel}>Current deadline:</Text>
                  <Text style={styles.currentDeadlineValue}>
                    {selectedAssignmentToExtend?.dueDate ? formatDate(selectedAssignmentToExtend.dueDate) : 'No due date'}
                  </Text>
                </View>
              </View>

              {/* New Deadline Section */}
              <View style={styles.newDeadlineSection}>
                <Text style={styles.sectionTitle}>Set New Deadline</Text>
                
                {/* Date Picker */}
                <View style={styles.dateTimeGroup}>
                  <Text style={styles.dateTimeLabel}>New Deadline Date</Text>
                  <TouchableOpacity
                    style={styles.dateTimePickerButton}
                    onPress={() => setShowExtendDatePicker(true)}
                  >
                    <View style={styles.dateTimePickerContent}>
                      <Text style={styles.dateTimePickerIcon}>📅</Text>
                      <Text style={styles.dateTimePickerText}>
                        {newExtendedDate.toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Time Picker */}
                <View style={styles.dateTimeGroup}>
                  <Text style={styles.dateTimeLabel}>New Deadline Time</Text>
                  <TouchableOpacity
                    style={styles.dateTimePickerButton}
                    onPress={() => setShowExtendTimePicker(true)}
                  >
                    <View style={styles.dateTimePickerContent}>
                      <Text style={styles.dateTimePickerIcon}>🕐</Text>
                      <Text style={styles.dateTimePickerText}>
                        {newExtendedDate.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Fixed Action Buttons */}
            <View style={styles.extendModalActions}>
              <TouchableOpacity 
                style={styles.extendCancelButton}
                onPress={() => setShowExtendDeadlineModal(false)}
              >
                <Text style={styles.extendCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.extendConfirmButton}
                onPress={handleExtendDeadline}
              >
                <Text style={styles.extendConfirmButtonText}>Extend Deadline</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Assignment Submission Modal */}
      <Modal visible={showSubmissionModal} animationType="slide" presentationStyle="fullScreen">
        <View style={styles.submissionModalContainer}>
          {selectedAssignment && (
            <>
              {/* Header */}
              <View style={styles.submissionModalHeader}>
                <TouchableOpacity onPress={closeSubmissionModal} style={styles.backButton}>
                  <Text style={styles.backIcon}>‹</Text>
                </TouchableOpacity>
                <View style={styles.headerRight}>
                  <TouchableOpacity style={styles.moreButton}>
                    <Text style={styles.moreIcon}>⋯</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView style={styles.submissionModalContent}>
                {/* Due Date Section */}
                <View style={styles.dueDateSection}>
                  <Text style={styles.dueDateLabel}>
                    Due {formatDate(selectedAssignment.dueDate)}
                    {isOverdue(selectedAssignment.dueDate) && ' (Overdue)'}
                  </Text>
                </View>

                {/* Assignment Title */}
                <View style={styles.assignmentTitleSection}>
                  <Text style={styles.submissionAssignmentTitle}>{selectedAssignment.title}</Text>
                  {selectedAssignment.points && (
                    <Text style={styles.submissionAssignmentPoints}>{selectedAssignment.points} pts</Text>
                  )}
                </View>

                {/* Previously Submitted Work Display */}
                {selectedAssignment.isSubmitted && selectedAssignment.userSubmission && (
                  <View style={styles.previousSubmissionSection}>
                    <Text style={styles.previousSubmissionTitle}>Your Previous Submission</Text>
                    
                    {/* Previous Attachments */}
                    {(selectedAssignment.userSubmission.attachedImages?.length > 0 || selectedAssignment.userSubmission.attachedFiles?.length > 0) && (
                      <View style={styles.previousAttachmentsSection}>
                        <Text style={styles.previousAttachmentsTitle}>Your Attachments:</Text>
                        
                        {/* Previous Images */}
                        {selectedAssignment.userSubmission.attachedImages?.map((image, index) => (
                          <TouchableOpacity 
                            key={`prev-image-${index}`} 
                            style={styles.previousAttachmentItem}
                            onPress={() => handleAttachmentPress(image, 'image')}
                          >
                            <Image source={{ uri: image.uri }} style={styles.previousAttachmentImage} />
                            <View style={styles.previousAttachmentInfo}>
                              <Text style={styles.previousAttachmentName}>{image.name}</Text>
                              <Text style={styles.previousAttachmentType}>Image</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                        
                        {/* Previous Files */}
                        {selectedAssignment.userSubmission.attachedFiles?.map((file, index) => (
                          <TouchableOpacity 
                            key={`prev-file-${index}`} 
                            style={styles.previousAttachmentItem}
                            onPress={() => handleAttachmentPress(file, 'file')}
                          >
                            <View style={styles.previousAttachmentFileIcon}>
                              <Text style={styles.previousAttachmentFileIconText}>📄</Text>
                            </View>
                            <View style={styles.previousAttachmentInfo}>
                              <Text style={styles.previousAttachmentName}>{file.name}</Text>
                              <Text style={styles.previousAttachmentType}>
                                {file.mimeType ? file.mimeType.split('/')[1].toUpperCase() : 'File'}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <View style={styles.submissionMetadata}>
                      <Text style={[
                        styles.submissionDate,
                        (() => {
                          const submittedAt = selectedAssignment.userSubmission.submittedAt;
                          let submissionDate;
                          
                          if (submittedAt && submittedAt.seconds) {
                            submissionDate = new Date(submittedAt.seconds * 1000);
                          } else if (submittedAt) {
                            submissionDate = new Date(submittedAt);
                          } else {
                            submissionDate = new Date();
                          }
                          
                          const dueDate = new Date(selectedAssignment.dueDate);
                          return submissionDate > dueDate ? styles.lateSubmission : styles.onTimeSubmission;
                        })()
                      ]}>
                        Submitted on {(() => {
                          const submittedAt = selectedAssignment.userSubmission.submittedAt;
                          let date;
                          
                          if (submittedAt && submittedAt.seconds) {
                            // Firestore timestamp
                            date = new Date(submittedAt.seconds * 1000);
                          } else if (submittedAt) {
                            // Regular date object or string
                            date = new Date(submittedAt);
                          } else {
                            date = new Date();
                          }
                          
                          return date.toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          });
                        })()}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Assignment Description */}
                {selectedAssignment.description && 
                 selectedAssignment.description.trim() !== 'dsad' && 
                 selectedAssignment.description.trim().length > 4 && (
                  <View style={styles.assignmentDescriptionSection}>
                    <Text style={styles.assignmentDescriptionText}>{selectedAssignment.description}</Text>
                  </View>
                )}

                {/* Assignment Instructions */}
                {selectedAssignment.instructions && 
                 selectedAssignment.instructions.trim() !== 'dsad' && 
                 selectedAssignment.instructions.trim().length > 4 && (
                  <View style={styles.assignmentInstructionsSection}>
                    <Text style={styles.assignmentInstructionsText}>{selectedAssignment.instructions}</Text>
                  </View>
                )}

                {/* Assignment Attachments */}
                {(selectedAssignment.attachedImages?.length > 0 || selectedAssignment.attachedFiles?.length > 0 || selectedAssignment.links?.length > 0) && (
                  <View style={styles.assignmentAttachmentsSection}>
                    <Text style={styles.attachmentsSectionTitle}>Attachments</Text>
                    
                    {/* Attached Images */}
                    {selectedAssignment.attachedImages?.map((image, index) => (
                      <TouchableOpacity 
                        key={`image-${index}`} 
                        style={styles.attachmentItemLarge}
                        onPress={() => handleAttachmentPress(image, 'image')}
                      >
                        <Image source={{ uri: image.uri }} style={styles.attachmentImageLarge} />
                        <View style={styles.attachmentInfoLarge}>
                          <Text style={styles.attachmentNameLarge}>{image.name}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                    
                    {/* Attached Files */}
                    {selectedAssignment.attachedFiles?.map((file, index) => (
                      <TouchableOpacity 
                        key={`file-${index}`} 
                        style={styles.attachmentItemLarge}
                        onPress={() => handleAttachmentPress(file, 'file')}
                      >
                        <View style={styles.attachmentFileLarge}>
                          <Text style={styles.attachmentFileIcon}>📄</Text>
                        </View>
                        <Text style={styles.attachmentNameLarge}>{file.name}</Text>
                        <TouchableOpacity style={styles.moreAttachmentButton}>
                          <Text style={styles.moreIcon}>⋯</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}

                    {/* Save all files offline button */}
                    {(selectedAssignment.attachedFiles?.length > 0 || selectedAssignment.attachedImages?.length > 0) && (
                      <TouchableOpacity style={styles.saveOfflineButton}>
                        <Text style={styles.saveOfflineButtonText}>Save all files offline</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* No Assignment Attachments Message */}
                {!selectedAssignment.isSubmitted && 
                 (!selectedAssignment.attachedImages || selectedAssignment.attachedImages.length === 0) && 
                 (!selectedAssignment.attachedFiles || selectedAssignment.attachedFiles.length === 0) && 
                 (!selectedAssignment.links || selectedAssignment.links.length === 0) && (
                  <View style={styles.noAssignmentAttachmentsContainer}>
                    <Text style={styles.noAssignmentAttachmentsText}>No attached files in assignment</Text>
                  </View>
                )}
              </ScrollView>

              {/* Your Work Section - Fixed at bottom */}
              <View style={styles.yourWorkSection}>
                <View style={styles.yourWorkHeader}>
                  <Text style={styles.yourWorkTitle}>Your work</Text>
                  <Text style={[
                    styles.yourWorkStatus,
                    (submissionData.text.trim() || submissionData.attachedFiles.length > 0 || submissionData.attachedImages.length > 0) 
                      ? styles.readyToTurnIn 
                      : selectedAssignment.isSubmitted 
                        ? styles.turnedIn
                        : styles.notTurnedIn
                  ]}>
                    {(submissionData.text.trim() || submissionData.attachedFiles.length > 0 || submissionData.attachedImages.length > 0) 
                      ? 'Ready to turn in' 
                      : selectedAssignment.isSubmitted 
                        ? 'Turned in'
                        : 'Not turned in'}
                  </Text>
                </View>

                {/* Attachments Preview */}
                {(submissionData.attachedImages.length > 0 || submissionData.attachedFiles.length > 0) && (
                  <ScrollView horizontal style={styles.workAttachmentsPreview} showsHorizontalScrollIndicator={false}>
                    {submissionData.attachedImages.map((image, index) => (
                      <TouchableOpacity 
                        key={`work-image-${index}`} 
                        style={styles.workAttachmentItem}
                        onPress={() => handleAttachmentPress(image, 'image')}
                      >
                        <Image source={{ uri: image.uri }} style={styles.workAttachmentImage} />
                        {!selectedAssignment.isSubmitted && (
                          <TouchableOpacity 
                            style={styles.removeWorkAttachment}
                            onPress={() => removeAttachment('image', index)}
                          >
                            <Text style={styles.removeWorkAttachmentText}>✕</Text>
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    ))}
                    
                    {submissionData.attachedFiles.map((file, index) => (
                      <TouchableOpacity 
                        key={`work-file-${index}`} 
                        style={styles.workAttachmentItem}
                        onPress={() => handleAttachmentPress(file, 'file')}
                      >
                        <View style={styles.workAttachmentFile}>
                          <Text style={styles.workAttachmentFileIcon}>📄</Text>
                          <Text style={styles.workAttachmentFileName} numberOfLines={1}>{file.name}</Text>
                        </View>
                        {!selectedAssignment.isSubmitted && (
                          <TouchableOpacity 
                            style={styles.removeWorkAttachment}
                            onPress={() => removeAttachment('file', index)}
                          >
                            <Text style={styles.removeWorkAttachmentText}>✕</Text>
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                {/* Add Work Buttons */}
                {!selectedAssignment.isSubmitted && (
                  <View style={styles.addWorkButtons}>
                    <TouchableOpacity style={styles.addWorkButton} onPress={pickImageForSubmission}>
                      <Text style={styles.addWorkButtonIcon}>📷</Text>
                      <Text style={styles.addWorkButtonText}>Camera</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={styles.addWorkButton} onPress={pickDocumentForSubmission}>
                      <Text style={styles.addWorkButtonIcon}>📎</Text>
                      <Text style={styles.addWorkButtonText}>File</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Text Response */}
                {!selectedAssignment.isSubmitted && (
                  <TextInput
                    style={styles.workTextInput}
                    placeholder="Add a comment for your teacher..."
                    placeholderTextColor="rgba(0, 0, 0, 0.5)"
                    multiline
                    value={submissionData.text}
                    onChangeText={(text) => setSubmissionData(prev => ({...prev, text}))}
                  />
                )}

                {/* Action Buttons */}
                <View style={styles.workActionButtons}>
                  <TouchableOpacity 
                    style={styles.unsubmitButton}
                    onPress={closeSubmissionModal}
                  >
                    <Text style={styles.unsubmitButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  
                  {isOverdue(selectedAssignment.dueDate) && !selectedAssignment.isSubmitted ? (
                    // Show disabled button with deadline message if overdue and not submitted
                    <View style={[styles.turnInButton, styles.turnInButtonDisabled]}>
                      <Text style={styles.turnInButtonText}>Deadline Passed</Text>
                    </View>
                  ) : (
                    // Normal submit/unsubmit button
                    <TouchableOpacity 
                      style={[styles.turnInButton, isSubmitting && styles.turnInButtonDisabled]}
                      onPress={selectedAssignment.isSubmitted ? unsubmitAssignment : submitAssignment}
                      disabled={isSubmitting}
                    >
                      <Text style={styles.turnInButtonText}>
                        {isSubmitting 
                          ? 'Processing...' 
                          : selectedAssignment.isSubmitted 
                            ? 'Unsubmit' 
                            : 'Submit'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* Instructor Submissions View Modal */}
      <Modal visible={showSubmissionsModal} animationType="slide" presentationStyle="fullScreen">
        <View style={styles.submissionModalContainer}>
          <View style={styles.submissionModalHeader}>
            <TouchableOpacity 
              onPress={() => {
                setShowSubmissionsModal(false);
                setSearchQuery(''); // Clear search when closing
                setFilterType('all'); // Reset filter when closing
                setFilteredSubmissionsList([]); // Clear filtered list
                getAssignments(); // Refresh assignments to update submission counts
              }}
              style={styles.submissionModalCloseButton}
            >
              <Text style={styles.submissionModalCloseText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.submissionModalTitle}>
              {currentAssignmentSubmissions?.title} - Submissions
            </Text>
          </View>

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search students by name or email..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={handleSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.searchIcon}>🔍</Text>
          </View>

          {/* Filter Buttons */}
          <View style={styles.filterContainer}>
            <TouchableOpacity 
              style={[styles.filterButton, filterType === 'all' && styles.filterButtonActive]}
              onPress={() => handleFilterChange('all')}
            >
              <Text style={[styles.filterButtonText, filterType === 'all' && styles.filterButtonTextActive]}>
                All ({submissionsList.length})
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.filterButton, filterType === 'submitted' && styles.filterButtonActive]}
              onPress={() => handleFilterChange('submitted')}
            >
              <Text style={[styles.filterButtonText, filterType === 'submitted' && styles.filterButtonTextActive]}>
                ✅ Submitted ({submissionsList.filter(item => item.hasSubmitted).length})
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.filterButton, filterType === 'not_submitted' && styles.filterButtonActive]}
              onPress={() => handleFilterChange('not_submitted')}
            >
              <Text style={[styles.filterButtonText, filterType === 'not_submitted' && styles.filterButtonTextActive]}>
                ⏳ Missing ({submissionsList.filter(item => !item.hasSubmitted).length})
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.submissionsScrollView}>
            <View style={styles.submissionsContainer}>
              <Text style={styles.submissionsStatsText}>
                {(() => {
                  const total = submissionsList.length;
                  const submitted = submissionsList.filter(item => item.hasSubmitted).length;
                  const notSubmitted = total - submitted;
                  const showing = filteredSubmissionsList.length;
                  
                  if (searchQuery) {
                    return `Showing ${showing} of ${total} students`;
                  }
                  
                  switch (filterType) {
                    case 'submitted':
                      return `${submitted} student${submitted !== 1 ? 's' : ''} submitted`;
                    case 'not_submitted':
                      return `${notSubmitted} student${notSubmitted !== 1 ? 's' : ''} haven't submitted`;
                    default:
                      return `${submitted} of ${total} student${total !== 1 ? 's' : ''} submitted`;
                  }
                })()}
              </Text>
              
              {filteredSubmissionsList.map((item, index) => (
                <View key={index} style={styles.submissionItem}>
                  <View style={styles.submissionStudentInfo}>
                    <View style={styles.submissionStatusIndicator}>
                      <View style={[
                        styles.statusDot, 
                        { backgroundColor: (() => {
                          if (!item.hasSubmitted) return '#f44336'; // Red for not submitted
                          if (!item.submission.submittedAt || !currentAssignmentSubmissions?.dueDate) return '#4CAF50'; // Green default
                          
                          const submissionDate = new Date(item.submission.submittedAt.toDate());
                          const dueDate = new Date(currentAssignmentSubmissions.dueDate);
                          const isLate = submissionDate > dueDate;
                          
                          return isLate ? '#FF9800' : '#4CAF50'; // Orange for late, Green for on time
                        })() }
                      ]} />
                    </View>
                    <Text style={styles.submissionStudentName}>
                      {item.student.name || item.student.email}
                    </Text>
                  </View>
                  
                  {item.hasSubmitted ? (
                    <View style={styles.submissionDetails}>
                      <View style={styles.submissionTimestampContainer}>
                        <Text style={styles.submissionTimestamp}>
                          Submitted: {item.submission.submittedAt ? new Date(item.submission.submittedAt.toDate()).toLocaleString() : 'Unknown'}
                        </Text>
                        {(() => {
                          if (!item.submission.submittedAt || !currentAssignmentSubmissions?.dueDate) return null;
                          
                          const submissionDate = new Date(item.submission.submittedAt.toDate());
                          const dueDate = new Date(currentAssignmentSubmissions.dueDate);
                          const isLate = submissionDate > dueDate;
                          
                          return (
                            <View style={[
                              styles.submissionStatusBadge,
                              isLate ? styles.lateBadge : styles.onTimeBadge
                            ]}>
                              <Text style={[
                                styles.submissionStatusBadgeText,
                                isLate ? styles.lateBadgeText : styles.onTimeBadgeText
                              ]}>
                                {isLate ? '⏰ Late' : '✅ On Time'}
                              </Text>
                            </View>
                          );
                        })()}
                      </View>
                      
                      {item.submission.text && (
                        <View style={styles.submissionTextContainer}>
                          <Text style={styles.submissionLabel}>Comment:</Text>
                          <Text style={styles.submissionText}>{item.submission.text}</Text>
                        </View>
                      )}
                      
                      {(item.submission.attachedFiles?.length > 0 || item.submission.attachedImages?.length > 0) && (
                        <View style={styles.submissionAttachmentsContainer}>
                          <Text style={styles.submissionLabel}>Attachments:</Text>
                          
                          {item.submission.attachedFiles?.map((file, fileIndex) => (
                            <TouchableOpacity
                              key={fileIndex}
                              style={styles.submissionAttachmentItem}
                              onPress={() => handleAttachmentPress(file, 'file')}
                            >
                              <Text style={styles.submissionAttachmentIcon}>📄</Text>
                              <Text style={styles.submissionAttachmentName}>{file.name}</Text>
                            </TouchableOpacity>
                          ))}
                          
                          {item.submission.attachedImages?.map((image, imageIndex) => (
                            <TouchableOpacity
                              key={imageIndex}
                              style={styles.submissionAttachmentItem}
                              onPress={() => handleAttachmentPress(image, 'image')}
                            >
                              <Text style={styles.submissionAttachmentIcon}>🖼️</Text>
                              <Text style={styles.submissionAttachmentName}>{image.name}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  ) : (
                    <Text style={styles.notSubmittedText}>Not submitted</Text>
                  )}
                </View>
              ))}
              
              {/* No Results Message */}
              {filteredSubmissionsList.length === 0 && submissionsList.length > 0 && (
                <View style={styles.noResultsContainer}>
                  <Text style={styles.noResultsIcon}>
                    {searchQuery ? '🔍' : filterType === 'submitted' ? '✅' : filterType === 'not_submitted' ? '⏳' : '📝'}
                  </Text>
                  <Text style={styles.noResultsText}>
                    {searchQuery 
                      ? `No students found matching "${searchQuery}"`
                      : filterType === 'submitted' 
                        ? 'No students have submitted yet'
                        : filterType === 'not_submitted'
                          ? 'All students have submitted!'
                          : 'No students found'
                    }
                  </Text>
                  <TouchableOpacity 
                    style={styles.clearSearchButton}
                    onPress={() => {
                      handleSearch('');
                      handleFilterChange('all');
                    }}
                  >
                    <Text style={styles.clearSearchButtonText}>Show All</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
      )}

      {/* Time Picker */}
      {showTimePicker && (
        <DateTimePicker
          value={selectedTime}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleTimeChange}
        />
      )}

      {/* Extend Deadline Date Picker */}
      {showExtendDatePicker && (
        <DateTimePicker
          value={newExtendedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleExtendDateChange}
          minimumDate={new Date()}
        />
      )}

      {/* Extend Deadline Time Picker */}
      {showExtendTimePicker && (
        <DateTimePicker
          value={newExtendedDate}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleExtendTimeChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
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
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E75C1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  assignmentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  assignmentCardDisabled: {
    backgroundColor: '#f8f9fa',
    opacity: 0.6,
  },
  assignmentHeader: {
    marginBottom: 12,
  },
  assignmentTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  assignmentTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  assignmentPoints: {
    fontSize: 14,
    color: '#E75C1A',
    fontWeight: 'bold',
    marginLeft: 12,
  },
  assignmentMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 32,
  },
  assignmentDueDate: {
    fontSize: 14,
    color: '#666',
    flex: 1,
    marginRight: 12,
  },
  overdue: {
    color: '#f44336',
    fontWeight: 'bold',
  },
  instructorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  extendButton: {
    backgroundColor: '#4A90E2',
    borderRadius: 6,
    padding: 6,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extendButtonText: {
    fontSize: 16,
    color: '#fff',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
    borderRadius: 6,
    padding: 6,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    fontSize: 16,
    color: '#fff',
  },
  assignmentDescription: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    marginBottom: 12,
  },
  instructionsSection: {
    marginBottom: 12,
  },
  instructionsLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  instructionsText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 18,
  },
  assignmentActions: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  submitButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  viewSubmissionsButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  viewSubmissionsButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    maxHeight: '80%',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalCloseButton: {
    fontSize: 20,
    color: '#666',
    padding: 4,
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    maxHeight: 400,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 12,
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: 'bold',
    fontSize: 14,
  },
  createButton: {
    backgroundColor: '#E75C1A',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  createButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  
  // Attachments Styles
  attachmentsSection: {
    marginBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  attachmentsLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  attachmentImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
    marginRight: 12,
    resizeMode: 'cover',
  },
  attachmentIcon: {
    fontSize: 20,
    marginRight: 12,
    textAlign: 'center',
    width: 24,
  },
  attachmentInfo: {
    flex: 1,
  },
  attachmentName: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    marginBottom: 2,
  },
  attachmentSize: {
    fontSize: 12,
    color: '#666',
  },
  linkUrl: {
    fontSize: 12,
    color: '#4A90E2',
    fontStyle: 'italic',
  },
  downloadIcon: {
    fontSize: 14,
    marginLeft: 8,
  },
  externalIcon: {
    fontSize: 14,
    marginLeft: 8,
  },
  
  // Attachment Modal Styles
  attachmentButtons: {
    flexDirection: 'row',
    marginBottom: 16,
    justifyContent: 'space-around',
  },
  attachmentButton: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f0f2f5',
    borderRadius: 8,
    minWidth: 80,
  },
  attachmentButtonIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  attachmentButtonText: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
  },
  attachedItemsContainer: {
    marginTop: 12,
  },
  attachedItemsLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginBottom: 8,
  },
  attachedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  previewImage: {
    width: 32,
    height: 32,
    borderRadius: 4,
    marginRight: 10,
    resizeMode: 'cover',
  },
  attachedFileIcon: {
    fontSize: 16,
    marginRight: 10,
    textAlign: 'center',
    width: 20,
  },
  attachedItemInfo: {
    flex: 1,
  },
  attachedItemName: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
    marginBottom: 2,
  },
  attachedItemSize: {
    fontSize: 10,
    color: '#666',
  },
  removeButton: {
    padding: 4,
    marginLeft: 8,
  },
  removeButtonText: {
    fontSize: 12,
    color: '#f44336',
    fontWeight: 'bold',
  },
  datePickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  datePickerText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  placeholderText: {
    color: '#999',
  },
  calendarIcon: {
    fontSize: 16,
    marginLeft: 8,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 4,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4A90E2',
    borderColor: '#4A90E2',
  },
  checkboxCheck: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#333',
  },
  timePickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  timePickerText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  clockIcon: {
    fontSize: 16,
    marginLeft: 8,
  },
  // Submission Modal Styles
  assignmentInfoSection: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  assignmentTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  assignmentPoints: {
    fontSize: 14,
    color: '#E75C1A',
    fontWeight: '600',
    marginBottom: 4,
  },
  assignmentDueDate: {
    fontSize: 14,
    color: '#666',
  },
  overdueText: {
    color: '#f44336',
    fontWeight: 'bold',
  },
  modalCloseButton: {
    fontSize: 18,
    color: '#666',
    padding: 4,
  },
  attachedImagePreview: {
    width: 40,
    height: 40,
    borderRadius: 4,
    marginRight: 12,
    resizeMode: 'cover',
  },
  submitAssignmentButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginLeft: 8,
  },
  submitAssignmentButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Submission Status Styles
  submissionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  submissionStatusIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  submissionStatusText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  resubmitButton: {
    backgroundColor: '#ff9800',
  },
  resubmitButtonText: {
    color: '#fff',
  },
  // Tap to submit section styles
  tapToSubmitSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tapToSubmitText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  tapToSubmitIcon: {
    fontSize: 16,
  },
  // Google Classroom style submission modal
  submissionModalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  submissionModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  moreButton: {
    padding: 8,
  },
  moreIcon: {
    fontSize: 20,
    color: '#fff',
  },
  submissionModalContent: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
  },
  dueDateSection: {
    marginBottom: 16,
  },
  dueDateLabel: {
    fontSize: 16,
    color: '#000000',
    fontWeight: '500',
  },
  assignmentTitleSection: {
    marginBottom: 20,
  },
  submissionAssignmentTitle: {
    fontSize: 28,
    color: '#000000',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  submissionAssignmentPoints: {
    fontSize: 16,
    color: '#000000',
    opacity: 0.8,
  },
  addClassCommentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    marginBottom: 24,
  },
  addClassCommentIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  addClassCommentText: {
    fontSize: 16,
    color: '#4A90E2',
    fontWeight: '500',
  },
  // Previous submission display styles
  previousSubmissionSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  previousSubmissionTitle: {
    fontSize: 18,
    color: '#4CAF50',
    fontWeight: 'bold',
    marginBottom: 16,
  },
  previousTextSubmission: {
    marginBottom: 16,
  },
  previousTextLabel: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
    marginBottom: 8,
  },
  previousTextContent: {
    fontSize: 16,
    color: '#000000',
    lineHeight: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    padding: 12,
    borderRadius: 8,
  },
  previousAttachmentsSection: {
    marginBottom: 16,
  },
  previousAttachmentsTitle: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
    marginBottom: 12,
  },
  previousAttachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  previousAttachmentImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
    marginRight: 12,
  },
  previousAttachmentFileIcon: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  previousAttachmentFileIconText: {
    fontSize: 16,
    color: '#000000',
  },
  previousAttachmentInfo: {
    flex: 1,
  },
  previousAttachmentName: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '500',
    marginBottom: 2,
  },
  previousAttachmentType: {
    fontSize: 12,
    color: 'rgba(0, 0, 0, 0.7)',
  },
  submissionMetadata: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    paddingTop: 12,
  },
  submissionDate: {
    fontSize: 12,
    color: 'rgba(0, 0, 0, 0.7)',
    fontStyle: 'italic',
  },
  onTimeSubmission: {
    color: '#4CAF50', // Green for on-time
  },
  lateSubmission: {
    color: '#f44336', // Red for late
  },
  assignmentDescriptionSection: {
    marginBottom: 20,
  },
  assignmentDescriptionText: {
    fontSize: 16,
    color: '#000000',
    lineHeight: 24,
  },
  assignmentInstructionsSection: {
    marginBottom: 20,
  },
  assignmentInstructionsText: {
    fontSize: 16,
    color: '#000000',
    lineHeight: 24,
  },
  assignmentAttachmentsSection: {
    marginBottom: 30,
  },
  attachmentsSectionTitle: {
    fontSize: 20,
    color: '#000000',
    fontWeight: 'bold',
    marginBottom: 16,
  },
  attachmentItemLarge: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  attachmentImageLarge: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 16,
  },
  attachmentFileLarge: {
    width: 60,
    height: 60,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  attachmentFileIcon: {
    fontSize: 24,
    color: '#000000',
  },
  attachmentInfoLarge: {
    flex: 1,
  },
  attachmentNameLarge: {
    fontSize: 16,
    color: '#000000',
    fontWeight: '500',
  },
  moreAttachmentButton: {
    padding: 8,
  },
  saveOfflineButton: {
    backgroundColor: '#4A90E2',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 16,
  },
  saveOfflineButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  yourWorkSection: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  yourWorkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  yourWorkTitle: {
    fontSize: 20,
    color: '#000000',
    fontWeight: 'bold',
  },
  yourWorkStatus: {
    fontSize: 16,
    fontWeight: '600',
  },
  turnedIn: {
    color: '#4CAF50',
  },
  notTurnedIn: {
    color: '#666666',
    opacity: 0.7,
  },
  readyToTurnIn: {
    color: '#FF9800',
  },
  workAttachmentsPreview: {
    marginBottom: 16,
  },
  noAttachmentsContainer: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 16,
    alignItems: 'center',
  },
  noAttachmentsText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  noAssignmentAttachmentsContainer: {
    paddingVertical: 30,
    paddingHorizontal: 20,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    margin: 16,
    alignItems: 'center',
  },
  noAssignmentAttachmentsText: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  workAttachmentItem: {
    position: 'relative',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  workAttachmentImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  workAttachmentFile: {
    width: 80,
    height: 80,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  workAttachmentFileIcon: {
    fontSize: 20,
    color: '#666',
    marginBottom: 4,
  },
  workAttachmentFileName: {
    fontSize: 10,
    color: '#333',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  removeWorkAttachment: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#f44336',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeWorkAttachmentText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  addWorkButtons: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  addWorkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginRight: 12,
  },
  addWorkButtonIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  addWorkButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '500',
  },
  workTextInput: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    color: '#000000',
    fontSize: 16,
    minHeight: 60,
    marginBottom: 20,
    textAlignVertical: 'top',
  },
  workActionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  unsubmitButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 24,
    flex: 1,
    marginRight: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  unsubmitButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
  turnInButton: {
    backgroundColor: '#4A90E2',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 24,
    flex: 1,
    marginLeft: 8,
    alignItems: 'center',
  },
  turnInButtonDisabled: {
    backgroundColor: 'rgba(74, 144, 226, 0.5)',
  },
  turnInButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Submissions View Modal Styles
  submissionsScrollView: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  submissionsContainer: {
    padding: 16,
  },
  submissionsStatsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
  },
  submissionItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  submissionStudentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  submissionStatusIndicator: {
    marginRight: 12,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  submissionStudentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  submissionDetails: {
    marginTop: 8,
  },
  submissionTimestamp: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  submissionTimestampContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  submissionStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  lateBadge: {
    backgroundColor: '#ffebee',
    borderWidth: 1,
    borderColor: '#f44336',
  },
  onTimeBadge: {
    backgroundColor: '#e8f5e8',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  submissionStatusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  lateBadgeText: {
    color: '#f44336',
  },
  onTimeBadgeText: {
    color: '#4CAF50',
  },
  submissionTextContainer: {
    marginBottom: 12,
  },
  submissionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  submissionText: {
    fontSize: 14,
    color: '#666',
    backgroundColor: '#f9f9f9',
    padding: 8,
    borderRadius: 6,
  },
  submissionAttachmentsContainer: {
    marginTop: 8,
  },
  submissionAttachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    padding: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  submissionAttachmentIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  submissionAttachmentName: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  notSubmittedText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 8,
  },
  
  // Search Bar Styles
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchIcon: {
    fontSize: 18,
    marginLeft: 12,
    color: '#666',
  },
  
  // Filter Buttons Styles
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    justifyContent: 'space-around',
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minWidth: 80,
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#4A90E2',
    borderColor: '#4A90E2',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  
  // No Results Styles
  noResultsContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  noResultsIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.5,
  },
  noResultsText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  clearSearchButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  clearSearchButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  currentDeadlineText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 4,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#6c757d',
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#4A90E2',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Extend Deadline Modal Styles
  extendDeadlineModalContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 80,
    marginBottom: 40,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    maxHeight: '85%',
    flex: 1,
  },
  extendModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  extendModalHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  extendModalIcon: {
    width: 40,
    height: 40,
    backgroundColor: '#4A90E2',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  extendModalIconText: {
    fontSize: 20,
    color: '#fff',
  },
  extendModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  extendModalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  extendModalCloseText: {
    fontSize: 16,
    color: '#666',
    fontWeight: 'bold',
  },
  extendModalScrollContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  assignmentInfoCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#4A90E2',
  },
  assignmentInfoLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  assignmentInfoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  currentDeadlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  currentDeadlineLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
  },
  currentDeadlineValue: {
    fontSize: 14,
    color: '#dc3545',
    fontWeight: '600',
  },
  newDeadlineSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  dateTimeGroup: {
    marginBottom: 16,
  },
  dateTimeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  dateTimePickerButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateTimePickerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dateTimePickerIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  dateTimePickerText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  extendModalActions: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 12,
  },
  extendCancelButton: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#ddd',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  extendCancelButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  extendConfirmButton: {
    flex: 1,
    backgroundColor: '#4A90E2',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  extendConfirmButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});