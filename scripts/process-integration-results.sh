#! /bin/bash
set -ueo pipefail

[ "x${DEBUG-}" = "x1" ] && set -x

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
for s in chain-*-storage.tar.xz; do
  [ -f "$s" ] || continue
  tar -C "xs-snapshots/" -xJf $s --wildcards '**/xs-snapshots/*.gz' --transform='s/.*\///'
done

to_backup="divergent_snapshots divergent_snapshot_vats validator-swingstore-trace.diff xs-snapshots"
to_delete="xs-snapshots"

snapshots=""
for trace in chain-*-swingstore-trace validator*-swingstore-trace; do
  [ -f "$trace" ] || continue
  snapshots_dir=${trace%"-swingstore-trace"}-snapshots
  mkdir -p $snapshots_dir
  to_delete="$to_delete $snapshots_dir"
  for v in $(<divergent_snapshot_vats); do
    mkdir -p $snapshots_dir/$v
    to_backup="$to_backup $snapshots_dir/$v"
    while read -r parsed; do
      set $parsed
      snapshots="$snapshots $1"
      ln -sf -T ../../xs-snapshots/$1 $snapshots_dir/$v/$2
    done < <({ grep "set local.$v.lastSnapshot" $trace || true; } | \
      cut -d ' ' -f 3 | \
      jq -src '[.[] | [.startPos.itemCount, .snapshotID] ] | to_entries[] | [.value[1], " ", (1 + .key | tostring | length | if . >= 3 then "" else "0" * (3 - .) end), (1 + .key | tostring), "-", (.value[0] | tostring)] | join("")' \
    )
  done
done

for h in $snapshots $(<divergent_snapshots); do
  echo $h
done | sort | uniq | while read -r h; do
  gunzip -f "xs-snapshots/$h.gz" || true
done
rm xs-snapshots/*.gz

# TODO: handle vat suspension (aka same vatID, multiple workers)
(mkdir -p validator0-xsnap-trace && cd $_ && tar -xzf ../$_.tgz && for v in *; do [ -d $v -a ! -h $v ] && ln -sf -T $v $(jq -r '.name | split(":") | .[0]' $v/00000-options.json) ; done; true)
(mkdir -p validator1-xsnap-trace && cd $_ && tar -xzf ../$_.tgz && for v in *; do [ -d $v -a ! -h $v ] && ln -sf -T $v $(jq -r '.name | split(":") | .[0]' $v/00000-options.json) ; done; true)
[ "x${DEBUG-}" = "x1" ] && set +x
for v in validator0-xsnap-trace/v*; do
  for file in $v/*; do
    file2=validator1${file#validator0}
    [ ${file%-snapshot.dat} = $file -o ! -f $file2 ] && diff -U0 $file $file2 || true
  done
done 2>&1 | grep -v "No newline at end of file" || true > validator-xsnap-trace.diff
[ "x${DEBUG-}" = "x1" ] && set -x
to_backup="$to_backup validator-xsnap-trace.diff"
to_delete="$to_delete validator0-xsnap-trace validator1-xsnap-trace"

for stage_trace in chain-stage-*-xsnap-trace.tgz; do
  [ -f "$stage_trace" ] || continue
  stage_trace=${stage_trace%".tgz"}
  mkdir -p $stage_trace
  to_delete="$to_delete $stage_trace"
  tar -xz -C "$stage_trace" -f "$stage_trace.tgz" || continue
  (cd $stage_trace && for v in *; do [ -d $v -a ! -h $v ] && ln -sf -T $v $(jq -r '.name | split(":") | .[0]' $v/00000-options.json) ; done; true)
done

[ -f monitor-vs-validator-swingstore-trace.diff ] && to_backup="$to_backup monitor-vs-validator-swingstore-trace.diff"

for trace in *-xsnap-trace/; do
  [ -d "$trace" ] || continue
  for v in $(<divergent_snapshot_vats); do
    to_backup="$to_backup $trace$v $trace$(readlink $trace$v)"
  done
done

tar -czf divergent_traces.tgz $to_backup
rm -rf $to_delete