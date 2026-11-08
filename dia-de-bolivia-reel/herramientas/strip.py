# strip.py vid start end [step] -> imagen con frames y nitidez para elegir in-points
import cv2, sys, json, numpy as np
S='/tmp/claude-0/-home-user-JulianMicicdeRosas/bcc472b1-8d48-5da6-9ead-6536003d30b3/scratchpad'
out=sys.argv[1]; specs=sys.argv[2:]
rows=[]
for sp in specs:
    v,a,b,st=sp.split(':'); a,b,st=float(a),float(b),float(st)
    sc=json.load(open(f'{S}/scores/{v}.mp4.json'))
    cap=cv2.VideoCapture(f'{S}/proxy/{v}.mp4'); fps=sc['fps']
    tiles=[]; t=a
    while t<=b+1e-6:
        cap.set(cv2.CAP_PROP_POS_MSEC,t*1000); ok,f=cap.read()
        if not ok: break
        f=cv2.resize(f,(144,256)); i=int(t*fps)
        sh=np.mean(sc['sharp'][i:i+3]); mo=np.mean(sc['motion'][i:i+3])
        cv2.rectangle(f,(0,0),(144,34),(0,0,0),-1)
        cv2.putText(f,f'{v} {t:.2f}',(3,13),0,0.42,(0,255,255),1)
        cv2.putText(f,f's{sh:.0f} m{mo:.1f}',(3,29),0,0.42,(255,255,255),1)
        tiles.append(f); t+=st
    while len(tiles)<12: tiles.append(np.zeros((256,144,3),np.uint8))
    rows.append(np.hstack(tiles[:12]))
cv2.imwrite(out,np.vstack(rows))
