import sys

#Define lists for tables, customers, and queues
tab = list()
cus = list()
q = [[], [], [], []]

#Define timeline and eventlist to store events
timeline = list()
eventlist = dict()

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
    print("This event is added!")

#Define function file_input to read input from file
def file_input():
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
            for i in range(n):
                line = file.readline()
                while line and line.strip() == '':
                    line = file.readline()
                if not line:
                    print("Not enough table information in input file.")
                    sys.exit()
                try:
                    table_cap, table_num = map(int, line.strip().split())
                except ValueError:
                    print("Invalid table information.")
                    sys.exit()
                for j in range(table_num):
                    tab.append([table_cap, True])
            
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
                cus.append([arrival_time, group_size, dining_duration])
                add_event(arrival_time, i, True)
    except FileNotFoundError:
        print("Input file not found.")
        sys.exit()

file_input()