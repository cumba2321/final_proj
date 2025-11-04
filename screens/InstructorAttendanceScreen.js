import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from '../firebase';
import { doc, setDoc, collection, getDocs, query, where, getDoc } from 'firebase/firestore';

export default function InstructorAttendanceScreen() {
  const navigation = useNavigation();
  // Sample data for demonstration
  const sampleSection = {
    id: 'sample-section-1',
    name: 'Section 1',
    students: [
      { id: '1', name: 'Smith, John' },
      { id: '2', name: 'Garcia, Maria' },
      { id: '3', name: 'Johnson, David' },
      { id: '4', name: 'Chen, Lisa' },
      { id: '5', name: 'Kim, Michelle' }
    ]
  };

  const [sections, setSections] = useState([sampleSection]);
  const [loading, setLoading] = useState(false);

  // Initialize with sample data
  useEffect(() => {
    setSections([sampleSection]);
    setLoading(false);
  }, []);
  const [selectedSection, setSelectedSection] = useState(sections[0]);

  
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
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        {/* Left: sections list */}
        <View style={styles.leftPane}>
          <Text style={styles.sectionListTitle}>Monitor Attendance</Text>
          {loading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading classes...</Text>
            </View>
          ) : (
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
          )}
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
              {(selectedSection?.students || []).map((stu) => {
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
});
