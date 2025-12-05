import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from '../firebase';
import { doc, setDoc, collection, getDocs, query, where, getDoc, updateDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export default function InstructorAttendanceScreen() {
  const navigation = useNavigation();

  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasClasses, setHasClasses] = useState(null);
  const [attendanceRequests, setAttendanceRequests] = useState([]);
  const [showRequests, setShowRequests] = useState(false);
  const [classStudents, setClassStudents] = useState({});

  // Fetch instructor's classes from Firestore
  useEffect(() => {
    let unsubClasses = () => {};
    let unsubRequests = () => {};
    
    const checkInstructorClasses = async (user) => {
      if (!user || !db) {
        setSections([]);
        setHasClasses(false);
        setLoading(false);
        return;
      }

      try {
        const classesCol = collection(db, 'classes');
        const q = query(classesCol, where('createdBy', '==', user.uid));
        const snap = await getDocs(q);
        if (snap.empty) {
          setSections([]);
          setHasClasses(false);
          setAttendanceRequests([]);
        } else {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setSections(list);
          setHasClasses(true);

          // Load student details for each class
          const studentsMap = {};
          for (const cls of list) {
            if (cls.students && Array.isArray(cls.students)) {
              const students = [];
              for (const studentId of cls.students) {
                try {
                  const userRef = doc(db, 'users', studentId);
                  const userSnap = await getDoc(userRef);
                  if (userSnap.exists()) {
                    students.push({
                      id: studentId,
                      name: userSnap.data().displayName || userSnap.data().email || 'Student',
                    });
                  } else {
                    students.push({
                      id: studentId,
                      name: 'Unknown Student',
                    });
                  }
                } catch (err) {
                  console.error('Error loading student:', err);
                  students.push({
                    id: studentId,
                    name: 'Student',
                  });
                }
              }
              studentsMap[cls.id] = students;
            } else {
              studentsMap[cls.id] = [];
            }
          }
          setClassStudents(studentsMap);

          // Load attendance requests for this instructor's classes
          const classIds = list.map(c => c.id);
          const attendanceCol = collection(db, 'attendance');
          const requestsQuery = query(
            attendanceCol, 
            where('status', '==', 'request'),
            where('classId', 'in', classIds)
          );

          unsubRequests = onSnapshot(
            requestsQuery,
            (snap) => {
              const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
              setAttendanceRequests(requests);
            },
            (err) => {
              console.error('Error loading requests:', err);
            }
          );
        }
        setLoading(false);
      } catch (err) {
        console.error('Error fetching instructor classes:', err);
        setSections([]);
        setHasClasses(false);
        setLoading(false);
      }
    };

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      checkInstructorClasses(user);
    });

    return () => {
      unsubAuth();
      unsubClasses();
      unsubRequests();
    };
  }, []);
  
  const [selectedSection, setSelectedSection] = useState(null);

  const [attendance, setAttendance] = useState({});

  
  const today = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [showCalendar, setShowCalendar] = useState(false);

  
  useEffect(() => {
    if (!selectedSection) setSelectedSection(sections[0] || null);
  }, [sections]);

  const formatDateKey = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const dateKey = formatDateKey(selectedDate);

  const getStudentStatus = (sectionId, studentId) => {
    return attendance?.[sectionId]?.[dateKey]?.[studentId] || null;
  };

  const setStudentStatus = (sectionId, studentId, status) => {
    setAttendance(prev => {
      const next = { ...prev };
      if (!next[sectionId]) next[sectionId] = {};
      if (!next[sectionId][dateKey]) next[sectionId][dateKey] = {};
      // toggle: if already set to same status, clear it
      next[sectionId][dateKey][studentId] = next[sectionId][dateKey][studentId] === status ? null : status;
      return next;
    });
  };

  // Subscribe to aggregated attendance doc for selected section and date
  useEffect(() => {
    if (!selectedSection) return;
    let unsub = () => {};
    try {
      const docId = `${selectedSection.id}_${dateKey}`;
      const aggRef = doc(db, 'attendance', docId);
      unsub = onSnapshot(aggRef, (snap) => {
        if (!snap.exists()) {
          // ensure we have an empty map for this date
          setAttendance(prev => {
            const next = { ...prev };
            if (!next[selectedSection.id]) next[selectedSection.id] = {};
            next[selectedSection.id][dateKey] = next[selectedSection.id][dateKey] || {};
            return next;
          });
          return;
        }
        const data = snap.data();
        const att = data.attendance || {};
        setAttendance(prev => {
          const next = { ...prev };
          if (!next[selectedSection.id]) next[selectedSection.id] = {};
          next[selectedSection.id][dateKey] = att;
          return next;
        });
      }, (err) => {
        console.error('Error listening to aggregated attendance:', err);
      });
    } catch (err) {
      console.error('Failed to subscribe to aggregated attendance', err);
    }

    return () => {
      try { unsub(); } catch (e) {}
    };
  }, [selectedSection, dateKey]);

 
  const getMonthDays = (d) => {
    const year = d.getFullYear();
    const month = d.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const days = [];
    for (let i = 1; i <= last.getDate(); i++) {
      days.push(new Date(year, month, i));
    }
    return { days, firstWeekday: first.getDay(), month, year };
  };

  const monthData = useMemo(() => getMonthDays(selectedDate), [selectedDate]);

  const approveAttendanceRequest = async (request, status = 'present') => {
    // Approve a student's request by adding/updating the aggregated attendance doc
    try {
      const classId = request.classId;
      const reqDate = request.date; // expected YYYY-MM-DD
      const docId = `${classId}_${reqDate}`;
      const aggRef = doc(db, 'attendance', docId);

      // Read existing aggregated attendance (if any)
      const aggSnap = await getDoc(aggRef);
      let agg = {};
      if (aggSnap.exists()) {
        const data = aggSnap.data();
        agg = data.attendance || {};
      }

      // set student status
      agg[request.studentId] = status;

      const payload = {
        sectionId: classId,
        date: reqDate,
        attendance: agg,
        updatedAt: new Date().toISOString(),
      };

      // Save aggregated attendance
      await setDoc(aggRef, payload);

      // Remove the original request doc
      try {
        const reqRef = doc(db, 'attendance', request.id);
        await deleteDoc(reqRef);
      } catch (err) {
        console.warn('Could not delete request doc:', err);
      }

      // Update local state so UI updates immediately
      setAttendance(prev => {
        const next = { ...prev };
        if (!next[classId]) next[classId] = {};
        if (!next[classId][reqDate]) next[classId][reqDate] = {};
        next[classId][reqDate][request.studentId] = status;
        return next;
      });

      Alert.alert('Success', `${request.studentName} marked as ${status}`);
    } catch (err) {
      console.error('Error approving attendance:', err);
      Alert.alert('Error', 'Failed to approve attendance');
    }
  };

  const rejectAttendanceRequest = async (request) => {
    try {
      const reqRef = doc(db, 'attendance', request.id);
      await deleteDoc(reqRef);
      // Also remove from local requests list for instant UI feedback
      setAttendanceRequests(prev => prev.filter(r => r.id !== request.id));
      Alert.alert('Success', `Attendance request rejected`);
    } catch (err) {
      console.error('Error rejecting attendance:', err);
      Alert.alert('Error', 'Failed to reject request');
    }
  };

  const saveAttendanceToFirestore = async () => {
    if (!db) {
      Alert.alert('Save', 'Firestore is not configured in this project. Attendance is saved locally.');
      return;
    }

    if (!selectedSection) return;

    try {
      const docId = `${selectedSection.id}_${dateKey}`;
      const docRef = doc(db, 'attendance', docId);
      const payload = {
        sectionId: selectedSection.id,
        sectionName: selectedSection.name,
        date: dateKey,
        attendance: attendance[selectedSection.id]?.[dateKey] || {},
        updatedAt: new Date().toISOString()
      };
      await setDoc(docRef, payload);
      // Also write per-student attendance records so students' listeners pick up the change
      const attendanceMap = payload.attendance || {};
      const attendanceCol = collection(db, 'attendance');
      for (const [studentId, status] of Object.entries(attendanceMap)) {
        if (!status) continue;
        try {
          const perDocId = `${selectedSection.id}_${dateKey}_${studentId}`;
          const perDocRef = doc(db, 'attendance', perDocId);
          const studentName = (classStudents[selectedSection.id] || []).find(s => s.id === studentId)?.name || '';
          await setDoc(perDocRef, {
            classId: selectedSection.id,
            className: selectedSection.name,
            studentId,
            studentName,
            date: dateKey,
            status,
            updatedAt: new Date().toISOString()
          });

          // Remove any pending request docs for this student/date
          try {
            const reqQuery = query(attendanceCol, where('classId', '==', selectedSection.id), where('studentId', '==', studentId), where('date', '==', dateKey), where('status', '==', 'request'));
            const reqSnap = await getDocs(reqQuery);
            for (const rd of reqSnap.docs) {
              await deleteDoc(doc(db, 'attendance', rd.id));
            }
          } catch (err) {
            console.warn('Failed to remove request docs for', studentId, err);
          }
        } catch (err) {
          console.error('Failed writing per-student attendance for', studentId, err);
        }
      }
      Alert.alert('Saved', 'Attendance saved to Firestore.');
    } catch (err) {
      console.error('Failed saving attendance', err);
      Alert.alert('Error', 'Failed to save attendance to Firestore. See console.');
    }
  };

  
  const Checkbox = ({ selected, onPress }) => (
    <TouchableOpacity onPress={onPress} style={[styles.checkbox, selected && styles.checkboxSelected]}>
      {selected && <Text style={styles.checkboxMark}>✓</Text>}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.title}>Monitor Attendance</Text>
        </View>
        <TouchableOpacity onPress={() => setShowRequests(true)} style={styles.requestsButton}>
          <Text style={styles.requestsBadge}>{attendanceRequests.length}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {loading ? (
          <View style={styles.loadingContainer} key="loading">
            <Text style={styles.loadingText}>Loading classes...</Text>
          </View>
        ) : hasClasses === false ? (
          <View style={{ padding: 28, alignItems: 'center', justifyContent: 'center', flex: 1 }} key="no-classes">
            <Text style={{ fontSize: 18, color: '#666', textAlign: 'center', marginBottom: 12 }}>
              Attendance function is not available yet. Please create class first in PATHfit Section.
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('PATHclass')} style={{ backgroundColor: '#E75C1A', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Create a class in PATHclass</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{flex:1}} key="has-classes">
            {/* Left: sections list */}
            <View style={styles.leftPane}>
              <Text style={styles.sectionListTitle}>Monitor Attendance</Text>
              <ScrollView style={styles.sectionList}>
                {sections.map((sec) => (
                  <TouchableOpacity
                    key={sec.id}
                    style={[styles.sectionItem, selectedSection?.id === sec.id && styles.sectionItemActive]}
                    onPress={() => setSelectedSection(sec)}
                  >
                    <Text style={styles.sectionIcon}>📁</Text>
                    <Text style={[styles.sectionItemText, selectedSection?.id === sec.id && styles.sectionItemTextActive]}>{sec.name}</Text>
                    <Text style={styles.sectionChevron}>{selectedSection?.id === sec.id ? '▾' : '▸'}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Right: attendance panel */}
            <View style={styles.rightPane}>
              <View style={styles.attHeaderRow}>
                <Text style={styles.attTitle}>{selectedSection ? `Section ${selectedSection.name}` : 'Select a section'}</Text>
                <TouchableOpacity style={styles.datePicker} onPress={() => setShowCalendar(true)}>
                  <Text style={styles.dateText}>{selectedDate.toLocaleDateString()}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.attBox}>
                <View style={styles.attRowHeader}>
                  <Text style={[styles.attCell, styles.nameCol, { color: '#666', fontWeight: '600' }]}>Name</Text>
                  <View style={[styles.attCell, {flex:1}]}> 
                    <View style={[styles.rowCheckboxContainer]}>
                      <View style={{ alignItems: 'center', width: 32 }}>
                        <Text style={styles.headerLabel}>Present</Text>
                      </View>
                      <View style={{ alignItems: 'center', width: 32 }}>
                        <Text style={styles.headerLabel}>Late</Text>
                      </View>
                      <View style={{ alignItems: 'center', width: 32 }}>
                        <Text style={styles.headerLabel}>Absent</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <ScrollView style={styles.attListScroll}>
                  {(classStudents[selectedSection?.id] || []).map((stu) => {
                    const status = getStudentStatus(selectedSection.id, stu.id);
                    return (
                      <View style={styles.attRow} key={stu.id}>
                        <View style={[styles.attCell, styles.nameCol]}>
                          <Text style={styles.studentName}>{stu.name}</Text>
                        </View>
                        <View style={[styles.attCell, {flex: 1}]}> 
                          <View style={styles.rowCheckboxContainer}>
                            <Checkbox selected={status === 'present'} onPress={() => setStudentStatus(selectedSection.id, stu.id, 'present')} />
                            <Checkbox selected={status === 'late'} onPress={() => setStudentStatus(selectedSection.id, stu.id, 'late')} />
                            <Checkbox selected={status === 'absent'} onPress={() => setStudentStatus(selectedSection.id, stu.id, 'absent')} />
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.saveButton} onPress={saveAttendanceToFirestore}>
                <Text style={styles.saveButtonText}>Save Attendance</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.clearButton} onPress={() => {
                // Clear today's attendance for selected section
                setAttendance(prev => {
                  const next = { ...prev };
                  if (next[selectedSection.id]) next[selectedSection.id][dateKey] = {};
                  return next;
                });
              }}>
                <Text style={styles.clearButtonText}>Clear</Text>
              </TouchableOpacity>
            </View>
            </View>
          </View>
        )}
      </View>

      {/* Calendar modal */}
      <Modal visible={showCalendar} transparent animationType="fade" onRequestClose={() => setShowCalendar(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.calendarModal}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={() => {
                const prev = new Date(selectedDate);
                prev.setMonth(prev.getMonth() - 1);
                setSelectedDate(prev);
              }}>
                <Text style={styles.calNav}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.calendarTitle}>{`${monthData.year} - ${selectedDate.toLocaleString(undefined, { month: 'long' })}`}</Text>
              <TouchableOpacity onPress={() => {
                const next = new Date(selectedDate);
                next.setMonth(next.getMonth() + 1);
                setSelectedDate(next);
              }}>
                <Text style={styles.calNav}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.weekdaysRow}>
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map((w) => (
                <Text key={w} style={styles.weekday}>{w}</Text>
              ))}
            </View>

            <ScrollView style={styles.daysGrid}>
              <View style={styles.daysRow}>
                {Array.from({ length: monthData.firstWeekday }).map((_, idx) => (
                  <View style={styles.dayCellEmpty} key={`empty-${idx}`} />
                ))}
                {monthData.days.map((day) => {
                  const isSelected = formatDateKey(day) === dateKey;
                  return (
                    <TouchableOpacity
                      key={day.toISOString()}
                      style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                      onPress={() => {
                        setSelectedDate(day);
                        setShowCalendar(false);
                      }}
                    >
                      <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>{String(day.getDate())}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.calendarFooter}>
              <TouchableOpacity onPress={() => setShowCalendar(false)} style={styles.closeCalButton}>
                <Text style={styles.closeCalText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showRequests} transparent animationType="slide" onRequestClose={() => setShowRequests(false)}>
        <View style={styles.requestsModalContainer}>
          <View style={styles.requestsModalHeader}>
            <Text style={styles.requestsModalTitle}>Attendance Requests ({attendanceRequests.length})</Text>
            <TouchableOpacity onPress={() => setShowRequests(false)} style={styles.requestsCloseButton}>
              <Text style={styles.requestsCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.requestsList}>
            {attendanceRequests.length === 0 ? (
              <View style={styles.emptyRequestsContainer}>
                <Text style={styles.emptyRequestsText}>No pending requests</Text>
              </View>
            ) : (
              attendanceRequests.map((req) => (
                <View key={req.id} style={styles.requestItem}>
                  <View style={styles.requestInfo}>
                    <Text style={styles.requestStudentName}>{req.studentName}</Text>
                    <Text style={styles.requestDate}>{req.date}</Text>
                  </View>
                  <View style={styles.requestActions}>
                    <TouchableOpacity 
                      onPress={() => {
                        Alert.alert(
                          'Approve request',
                          `Mark ${req.studentName} as:`,
                          [
                            { text: 'Present', onPress: () => approveAttendanceRequest(req, 'present') },
                            { text: 'Late', onPress: () => approveAttendanceRequest(req, 'late') },
                            { text: 'Absent', onPress: () => approveAttendanceRequest(req, 'absent') },
                            { text: 'Cancel', style: 'cancel' }
                          ],
                        );
                      }}
                      style={styles.approveButton}
                    >
                      <Text style={styles.approveButtonText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => rejectAttendanceRequest(req)}
                      style={styles.rejectButton}
                    >
                      <Text style={styles.rejectButtonText}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingTop: 40, paddingBottom: 12, paddingHorizontal: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee'
  },
  backButton: { padding: 8 },
  backIcon: { fontSize: 24, color: '#333' },
  headerTitleContainer: { flex: 1, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#E75C1A' },
  requestsButton: { 
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    backgroundColor: '#E75C1A', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  requestsBadge: { 
    color: '#fff', 
    fontWeight: '700', 
    fontSize: 14 
  },

  // Mobile-first: stack sections and attendance vertically
  body: { flex: 1, flexDirection: 'column' },
  leftPane: { width: '100%', borderBottomWidth: 1, borderBottomColor: '#eee', padding: 12, backgroundColor: '#fff' },
  rightPane: { width: '100%', padding: 12, backgroundColor: '#fff' },

  sectionListTitle: { fontSize: 14, color: '#333', marginBottom: 8, fontWeight: '600' },
  sectionList: { },
  sectionItem: { padding: 10, borderRadius: 8, backgroundColor: '#fff', marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#eee' },
  sectionItemActive: { backgroundColor: '#E75C1A', borderColor: '#E75C1A' },
  sectionIcon: { marginRight: 10, fontSize: 18 },
  sectionItemText: { color: '#333', fontWeight: '600', textAlign: 'left', flex: 1 },
  sectionItemTextActive: { color: '#fff' },
  sectionChevron: { marginLeft: 8, color: '#999' },

  attHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  attTitle: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: '#333' 
  },
  datePicker: { 
    paddingVertical: 8, 
    paddingHorizontal: 16, 
    borderWidth: 1, 
    borderColor: '#E8E8E8', 
    borderRadius: 8, 
    backgroundColor: '#fff'
  },
  dateText: { 
    color: '#333',
    fontSize: 13,
    fontWeight: '500'
  },

  attBox: { 
    borderWidth: 1, 
    borderColor: '#E8E8E8', 
    borderRadius: 12, 
    padding: 16, 
    minHeight: 180,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  attRowHeader: { 
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
    marginBottom: 8
  },
  attRow: { 
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5'
  },
  attCell: { 
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  nameCol: { 
    flex: 2,
    paddingLeft: 16,
    alignItems: 'flex-start',
    justifyContent: 'center'
  },
  studentName: { 
    fontSize: 14,
    color: '#333',
    fontWeight: '500'
  },
  rowCheckboxContainer: { 
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 120,
    marginRight: 16
  },
  attListScroll: { 
    maxHeight: 320
  },
  headerLabel: { 
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontWeight: '500'
  },

  checkbox: { 
    width: 18, 
    height: 18, 
    borderWidth: 1.5, 
    borderColor: '#D0D0D0', 
    borderRadius: 4, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: '#fff'
  },
  checkboxSelected: { 
    backgroundColor: '#E75C1A', 
    borderColor: '#E75C1A' 
  },
  checkboxMark: { 
    color: '#fff', 
    fontSize: 11,
    fontWeight: '900',
    marginTop: -1
  },

  actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  saveButton: { backgroundColor: '#E75C1A', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  saveButtonText: { color: '#fff', fontWeight: '700' },
  clearButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', marginLeft: 8 },
  clearButtonText: { color: '#333' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#666', fontSize: 16 },
  calendarModal: { width: 320, backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden' },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  calNav: { fontSize: 22, color: '#333', paddingHorizontal: 8 },
  calendarTitle: { fontWeight: '700', color: '#333' },
  weekdaysRow: { flexDirection: 'row', padding: 8, justifyContent: 'space-around' },
  weekday: { width: 40, textAlign: 'center', color: '#666' },
  daysGrid: { maxHeight: 260 },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', padding: 8 },
  dayCell: { width: 40, height: 36, justifyContent: 'center', alignItems: 'center', margin: 2, borderRadius: 6 },
  dayCellSelected: { backgroundColor: '#E75C1A' },
  dayCellEmpty: { width: 40, height: 36, margin: 2 },
  dayText: { color: '#333' },
  dayTextSelected: { color: '#fff', fontWeight: '700' },
  calendarFooter: { padding: 12, alignItems: 'flex-end' },
  closeCalButton: { paddingVertical: 6, paddingHorizontal: 12 },
  closeCalText: { color: '#E75C1A', fontWeight: '700' },
  inlineCalendarCard: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 12, backgroundColor: '#fff', marginTop: 12 },
  inlineCalendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  inlineMonthTitle: { fontSize: 16, fontWeight: '700' },

  requestsModalContainer: { 
    flex: 1, 
    backgroundColor: '#fff', 
    marginTop: 80,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden'
  },
  requestsModalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  requestsModalTitle: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#333' 
  },
  requestsCloseButton: { 
    width: 36, 
    height: 36, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  requestsCloseText: { 
    fontSize: 20, 
    color: '#999' 
  },
  requestsList: { 
    flex: 1,
    padding: 12
  },
  emptyRequestsContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  emptyRequestsText: { 
    color: '#999', 
    fontSize: 14 
  },
  requestItem: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    backgroundColor: '#f9f9f9'
  },
  requestInfo: { 
    flex: 1 
  },
  requestStudentName: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#333',
    marginBottom: 4
  },
  requestDate: { 
    fontSize: 12, 
    color: '#999' 
  },
  requestActions: { 
    flexDirection: 'row', 
    gap: 8 
  },
  approveButton: { 
    backgroundColor: '#4CAF50', 
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6
  },
  approveButtonText: { 
    color: '#fff', 
    fontWeight: '600',
    fontSize: 12
  },
  rejectButton: { 
    backgroundColor: '#E53935', 
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6
  },
  rejectButtonText: { 
    color: '#fff', 
    fontWeight: '600',
    fontSize: 12
  },
});
