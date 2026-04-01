import sys

#Define lists for tables, customers, and queues
tab = list() #Each element represents a table: [capacity,availability(True for available, False for occupied)]
cus = list() #Each element represents a customer group: [arrival_time, group_size, dining_duration, table_id(-1 if not seated)]
q = [[], [], [], []] #Each element represents a queue for a specific table capacity range: [<all group ids in this queue>]
tab_num = [0, 0, 0, 0] #Number of tables in each capacity range (corresponding to the queues)

#Define timeline and eventlist to store events
timeline = list() #Each element represents a time point when an event occurs
eventlist = dict() #Key: time point, Value: list of events at that time point

#Define function add_event to add events to the eventlist and timeline
def add_event(time, gid, event_type):
    if (time not in timeline):
        if (len(timeline) == 0):
            timeline.append(time)
        elif (len(timeline) == 1):
            if (timeline[0] < time):
                timeline.append(time)
            else:
                timeline.insert(0, time)
        elif (timeline[-1] < time):
            timeline.append(time)
        else:
            for i in range(len(timeline) - 1):
                if (timeline[i] < time) and (timeline[i + 1] > time):
                    timeline.insert(i + 1, time)
                    temp = i + 1
                    break
        eventlist[time] = [(gid, event_type)]
    else:
        eventlist[time].append((gid, event_type))
    print("This event is added at time " + str(time) + ": " + ("Customer group " + str(gid) + " arrives." if event_type == True else "Customer group " + str(gid) + " departs."))

#Define function file_input to read input from file
def file_input():
    global tab, cus, q, tab_num
    try:
        with open("input.txt", "r") as file:
            #Read the first line to get the number of tables and their capacities
            line = file.readline()
            while line and line.strip() == '':
                line = file.readline()
            if not line:
                print("Input file is empty.")
                if_error = True
                sys.exit()
            try:
                n = int(line.strip())
            except ValueError:
                print("Invalid number of tables.")
                sys.exit()
            temp_tab = list()
            for i in range(n):
                line = file.readline()
                while line and line.strip() == '':
                    line = file.readline()
                if not line:
                    print("Not enough table information in input file.")
                    sys.exit()
                try:
                    table_cap, table_num = map(int, line.strip().split())
                    #Update the number of tables in each capacity range
                    if (table_cap <= 2):
                        tab_num[0] += table_num
                    elif (table_cap <= 4):
                        tab_num[1] += table_num
                    elif (table_cap <= 6):
                        tab_num[2] += table_num
                    else:
                        tab_num[3] += table_num
                except ValueError:
                    print("Invalid table information.")
                    sys.exit()
                for j in range(table_num):
                    temp_tab.append([table_cap, True])
            tab = sorted(temp_tab, key=lambda x: x[0])
            
            #Read the number of customers, then their group sizes, arrival times, and dining durations
            line = file.readline()
            while line and line.strip() == '':
                line = file.readline()
            if not line:
                print("Not enough customer information in input file.")
                sys.exit()
            try:
                m = int(line.strip())
            except ValueError:
                print("Invalid number of customers.")
                sys.exit()
            for i in range(m):
                line = file.readline()
                while line and line.strip() == '':
                    line = file.readline()
                if not line:
                    print("Not enough customer information in input file.")
                    sys.exit()
                try:
                    arrival_time, group_size, dining_duration = map(int, line.strip().split())
                except ValueError:
                    print("Invalid customer information.")
                    sys.exit()
                cus.append([arrival_time, group_size, dining_duration, -1])
                add_event(arrival_time, i, True)
    except FileNotFoundError:
        print("Input file not found.")
        sys.exit()

#Define function dining_start to handle the start of dining for a customer group
def dining_start(time, tid, qid):
    temp = q[qid][0]
    q[qid].pop(0)
    cus[temp][3] = tid
    tab[tid][1] = False

    #Calculate the departure time and add the departure event
    minutes = time % 100 + cus[temp][2]
    hours = time // 100 + minutes // 60
    minutes = minutes % 60
    departure_time = hours * 100 + minutes
    add_event(departure_time, temp, False)

    print("Customer group " + str(temp) + " starts dining at time " + str(time) + " at table " + str(tid) + ".")

def dining_end(time, tid, gid):
    cus[gid][3] = -1
    tab[tid][1] = True

    print("Customer group " + str(gid) + " finishes dining at time " + str(time) + " and leaves table " + str(tid) + ".")

def add_to_queue(gid):
    group_size = cus[gid][1]
    if (group_size <= 2):
        q[0].append(gid)
    elif (group_size <= 4):
        q[1].append(gid)
    elif (group_size <= 6):
        q[2].append(gid)
    else:
        q[3].append(gid)

#Check if there are available tables for the queue and start dining if possible
def check_queue(qid, time):
    table_end = sum(tab_num[:qid + 1])
    table_start = table_end - tab_num[qid]
    max_group = len(q[qid])
    for i in range(table_start, table_end):
        if (max_group == 0):
            break
        if (tab[i][1] == True and cus[q[qid][0]][1] <= tab[i][0]):
            dining_start(time, i, qid)
            max_group -= 1

#Main function    
def main():
    file_input()
    print("There are " + str(len(tab)) + " tables and " + str(len(cus)) + " customer groups in total.")
    temp = 0
    time = 0

    #Process events in chronological order
    while (temp < len(timeline)):
        time = timeline[temp]
        print("Processing events at time " + str(time) + ".")
        event_id = 0
        #Handle Customer Arrivals
        while (eventlist[time][event_id][1] == True):
            print("Customer group " + str(eventlist[time][event_id][0]) + " arrives at time " + str(time) + ".")
            add_to_queue(eventlist[time][event_id][0])
            event_id += 1
            if (event_id >= len(eventlist[time])):
                break

        #Handle Customer Departures
        while (event_id < len(eventlist[time])):
            dining_end(time, cus[eventlist[time][event_id][0]][3], eventlist[time][event_id][0])
            event_id += 1

        #Handle Table Assignments
        for i in range(4):
            check_queue(i, time)

        temp += 1

main()