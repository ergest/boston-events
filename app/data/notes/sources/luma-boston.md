status: broken
The rig's fetch of the Luma ICS feed (https://api.lu.ma/ics/get?entity=discover&id=discplace-VWeZ1zUvnawYHMj) timed out (raw/luma-boston/FETCH_ERROR.txt), so chunk.mjs had no chunks to serve.
A direct retry from this session returned HTTP 200 with 19 VEVENTs, so the feed is live and a re-run of the fetch should yield events. No events were extracted here because the chunk pipeline was not given the data.
