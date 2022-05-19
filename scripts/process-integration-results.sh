#! /bin/bash
set -uxeo pipefail

real0=$(readlink "${BASH_SOURCE[0]}" || echo "${BASH_SOURCE[0]}")
thisdir=$(cd "$(dirname -- "$real0")" > /dev/null && pwd -P)

NETWORK_NAME=${NETWORK_NAME-localtest}
RESULTSDIR=${RESULTSDIR-"$NETWORK_NAME/results"}

[ $# -gt 0 ] && RESULTSDIR="$1"

"$thisdir/process-integration-swingstore-traces.sh" "$RESULTSDIR"

[ -f "$RESULTSDIR/divergent_snapshots" ] || exit 0

cd "$RESULTSDIR"

mkdir -p "xs-snapshots"
cp -a validator0-xs-snapshots/* "xs-snapshots/"
cp -a validator1-xs-snapshots/* "xs-snapshots/"
tar -C "xs-snapshots/" -xJf "chain-stage-0-storage.tar.xz" --wildcards '**/xs-snapshots/*.gz' --transform='s/.*\///'
tar -C "xs-snapshots/" -xJf "chain-stage-1-storage.tar.xz" --wildcards '**/xs-snapshots/*.gz' --transform='s/.*\///'
for h in $(cat "divergent_snapshots"); do
  gunzip -f "xs-snapshots/$h.gz" || echo "Missing snapshot $f"
done
rm xs-snapshots/*.gz

# TODO: handle vat suspension
(mkdir -p validator0-xsnap-trace && cd $_ && tar -xzf ../$_.tgz && for v in *; do [ -d $v -a ! -h $v ] && ln -sf -T $v $(jq -r '.name | split(":") | .[0]' $v/00000-options.json) ; done; true)
(mkdir -p validator1-xsnap-trace && cd $_ && tar -xzf ../$_.tgz && for v in *; do [ -d $v -a ! -h $v ] && ln -sf -T $v $(jq -r '.name | split(":") | .[0]' $v/00000-options.json) ; done; true)
set +x
for v in validator0-xsnap-trace/v*; do
  for file in $v/*; do
    file2=validator1${file#validator0}
    [ ${file%-snapshot.dat} = $file -o ! -f $file2 ] && diff -U0 $file $file2 || true
  done
done 2>&1 | grep -v "No newline at end of file" || true > validator-xsnap-trace.diff
set -x

for stage_trace in chain-stage-*-xsnap-trace.tgz; do
  [ -f "$stage_trace" ] || continue
  stage_trace=${stage_trace%".tgz"}
  mkdir -p $stage_trace
  tar -xz -C "$stage_trace" -f "$stage_trace.tgz" || continue
  (cd $stage_trace && for v in *; do [ -d $v -a ! -h $v ] && ln -sf -T $v $(jq -r '.name | split(":") | .[0]' $v/00000-options.json) ; done; true)
done

to_backup="divergent_snapshots divergent_snapshot_vats validator-swingstore-trace.diff validator-xsnap-trace.diff xs-snapshots"

[ -f monitor-vs-validator-swingstore-trace.diff ] && to_backup="$to_backup monitor-vs-validator-swingstore-trace.diff"

for trace in *-xsnap-trace/; do
  [ -d "$trace" ] || continue
  for v in $(cat "divergent_snapshot_vats"); do
    to_backup="$to_backup $trace$v $trace$(readlink $trace$v)"
  done
done

tar -czf divergent_traces.tgz $to_backup
rm -rf *-xsnap-trace/ xs-snapshots/