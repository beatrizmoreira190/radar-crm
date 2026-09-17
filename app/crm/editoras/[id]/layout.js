import PublisherMaterialsMount from '@/components/PublisherMaterialsMount';
import PublisherMeetingsMount from '@/components/PublisherMeetingsMount';
import PublisherRadarDetailMount from '@/components/PublisherRadarDetailMount';
import PublisherUxHierarchyMount from '@/components/PublisherUxHierarchyMount';
import PublisherMeetingActionsPolish from '@/components/PublisherMeetingActionsPolish';

export default function PublisherDetailLayout({children}){
  return <>{children}<PublisherMeetingsMount/><PublisherMaterialsMount/><PublisherRadarDetailMount/><PublisherUxHierarchyMount/><PublisherMeetingActionsPolish/></>;
}
