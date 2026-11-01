"""Read-only release hygiene checks. Requires Python 3.9+; no external packages.
Does not print matching secret values. Exit 1 means review is required.
"""
import argparse, hashlib, json, re, zipfile
from pathlib import Path, PurePosixPath

PATTERNS = {
    'private_key': rb'-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----',
    'github_token': rb'(?<![A-Za-z0-9_-])(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})',
    'openai_token': rb'(?<![A-Za-z0-9_-])sk-(?:proj-)?[A-Za-z0-9_-]{32,}',
    'aws_key': rb'(?<![A-Z0-9])AKIA[0-9A-Z]{16}(?![A-Z0-9])',
    'slack_token': rb'(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{20,}',
    'local_user_path': rb'[A-Za-z]:[\\/]Users[\\/][A-Za-z0-9_. -]+[\\/]',
}
FORBIDDEN_DIRS = {'.git','.codex','.claude','.agents','.aws','.ssh','library','temp','logs','usersettings','records','screenshots','.vs','__pycache__'}
FORBIDDEN_SUFFIXES = {'.sgf','.log','.pdb','.mdb','.dmp','.sqlite','.sqlite3','.db','.bak','.key','.pfx','.p12','.keystore','.user','.suo','.pyc'}

def scan(name, data, findings):
    path = PurePosixPath(name.replace('\\','/'))
    if path.is_absolute() or '..' in path.parts:
        findings.append({'file':name,'kind':'unsafe_path'})
    if any(part.lower() in FORBIDDEN_DIRS for part in path.parts):
        findings.append({'file':name,'kind':'private_or_generated_directory'})
    if path.suffix.lower() in FORBIDDEN_SUFFIXES or path.name == '.env' or path.name.startswith('.env.'):
        findings.append({'file':name,'kind':'private_or_generated_file'})
    # Models are binary floats from checksum-pinned public upstream artifacts.
    if name.endswith('.bin.gz'): return
    # Chunk scan avoids loading a second full copy of large libraries.
    for label, pattern in PATTERNS.items():
        found = False
        for i in range(0,len(data),1024*1024):
            chunk=data[max(0,i-512):i+1024*1024]
            if re.search(pattern,chunk): found=True; break
            for alignment in (0,1):
                # Only collapse contiguous printable UTF-16LE strings, not all NUL bytes.
                for m in re.finditer(rb'(?:[\x20-\x7e]\x00){8,}',chunk[alignment:]):
                    if re.search(pattern,m.group()[::2]): found=True;break
                if found:break
            if found:break
        if found: findings.append({'file':name,'kind':label})

def run(target):
    findings=[]; count=0; total=0
    if target.is_file() and target.suffix.lower()=='.zip':
        with zipfile.ZipFile(target) as archive:
            bad=archive.testzip()
            if bad:findings.append({'file':bad,'kind':'crc_failure'})
            for entry in archive.infolist():
                if entry.is_dir():continue
                data=archive.read(entry);count+=1;total+=len(data);scan(entry.filename,data,findings)
    else:
        for p in sorted(target.rglob('*')):
            if not p.is_file():continue
            relative=p.relative_to(target).as_posix()
            if relative.startswith('release-assets/'):
                continue # Audit release ZIP separately, including all archive members.
            data=p.read_bytes();count+=1;total+=len(data);scan(relative,data,findings)
            if len(data)>25*1024*1024:findings.append({'file':relative,'kind':'too_large_for_web_source_upload'})
    return {'target':target.name,'files':count,'bytes':total,'findings':findings,'status':'PASS' if not findings else 'REVIEW_REQUIRED'}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('target',type=Path);args=parser.parse_args()
    if not args.target.exists():parser.error('Target not found')
    result=run(args.target.resolve());print(json.dumps(result,ensure_ascii=False,indent=2))
    raise SystemExit(0 if result['status']=='PASS' else 1)
