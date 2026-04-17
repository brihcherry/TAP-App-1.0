# TEMP: New App 

Rough outline:

Populate a list of systems in a given capability bucket.

For each system, we need the following information:
-> Other systems and interfaces within that bucket that send data back and forth 
-> all 7 System Similarity data buckets 

The tool should allow the user to select a node and "Delete" it, and should then give
the user information about what information, interfaces, data flow, etc is now missing.

Options:
-> generate a list of all connecting nodes that are affected
-> generate a list of the connections (edges) that are now missing
-> more complicated but more useful: actually trace data flow that was
   affected by the now-missing edges, and determine whether an alternative
   flow path already exists. 
-> etc - add more as ideas come

